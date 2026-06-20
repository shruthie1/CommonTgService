import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SessionAuditService } from '../session-audit.service';
import {
    SessionAudit,
    SessionAuditDocument,
    SessionAuditSchema,
    SessionStatus,
    SessionCreationMethod,
} from '../schemas/sessions.schema';

describe('SessionAuditService (real in-memory mongo)', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: Model<SessionAuditDocument>;
    let service: SessionAuditService;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'session-audit-svc-test' }).asPromise();
        model = connection.model<SessionAuditDocument>('SessionAuditSvcTest', SessionAuditSchema);
        await model.init();
        service = new SessionAuditService(model as any);
    });

    afterEach(async () => {
        await model.deleteMany({});
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await connection.close();
        await mongod.stop();
    });

    const baseCreate = (overrides: any = {}) => ({
        mobile: '911111',
        sessionString: 'sess-string',
        creationMethod: SessionCreationMethod.USER_MOBILE,
        creationMessage: 'ok',
        ...overrides,
    });

    describe('createAuditRecord', () => {
        it('creates a record with defaults', async () => {
            const rec = await service.createAuditRecord(baseCreate());
            expect(rec.mobile).toBe('911111');
            expect(rec.status).toBe(SessionStatus.CREATED);
            expect(rec.isActive).toBe(true);
            expect(rec.usageCount).toBe(0);
        });

        it('rethrows on save error', async () => {
            jest.spyOn(model.prototype as any, 'save').mockRejectedValueOnce(new Error('save boom'));
            await expect(service.createAuditRecord(baseCreate())).rejects.toThrow('save boom');
        });
    });

    describe('updateAuditRecord', () => {
        it('updates the matching active record by sessionString', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'find-me' }));
            const updated = await service.updateAuditRecord('911111', 'find-me', { status: SessionStatus.ACTIVE });
            expect(updated?.status).toBe(SessionStatus.ACTIVE);
        });

        it('updates latest record when no sessionString provided', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'a' }));
            const updated = await service.updateAuditRecord('911111', undefined, { username: 'newname' });
            expect(updated?.username).toBe('newname');
        });

        it('returns null when no active record found', async () => {
            const updated = await service.updateAuditRecord('nonexistent', 'x', { status: SessionStatus.ACTIVE });
            expect(updated).toBeNull();
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'findOneAndUpdate').mockRejectedValueOnce(new Error('update boom'));
            await expect(service.updateAuditRecord('911111', 'x', {})).rejects.toThrow('update boom');
        });
    });

    describe('markSessionUsed', () => {
        it('returns null for invalid mobile', async () => {
            expect(await service.markSessionUsed('')).toBeNull();
            expect(await service.markSessionUsed('   ')).toBeNull();
            expect(await service.markSessionUsed(null as any)).toBeNull();
        });

        it('increments usage count and updates lastUsedAt', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'inc' }));
            const r1 = await service.markSessionUsed('911111', 'inc');
            expect(r1?.usageCount).toBe(1);
            const r2 = await service.markSessionUsed('911111', 'inc');
            expect(r2?.usageCount).toBe(2);
        });

        it('uses latest record when no sessionString', async () => {
            await service.createAuditRecord(baseCreate());
            const r = await service.markSessionUsed('911111');
            expect(r?.usageCount).toBe(1);
        });

        it('ignores blank sessionString in query', async () => {
            await service.createAuditRecord(baseCreate());
            const r = await service.markSessionUsed('911111', '   ');
            expect(r?.usageCount).toBe(1);
        });

        it('warns and returns null when no active session', async () => {
            const r = await service.markSessionUsed('000000', 'nope');
            expect(r).toBeNull();
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'findOneAndUpdate').mockRejectedValueOnce(new Error('inc boom'));
            await expect(service.markSessionUsed('911111')).rejects.toThrow('inc boom');
        });
    });

    describe('markSessionFailed', () => {
        it('marks the session failed and inactive', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'fail-me' }));
            const r = await service.markSessionFailed('911111', 'fail-me', 'bad creds');
            expect(r?.status).toBe(SessionStatus.FAILED);
            expect(r?.isActive).toBe(false);
            expect(r?.errorMessage).toBe('bad creds');
        });

        it('rethrows when underlying update throws', async () => {
            jest.spyOn(service, 'updateAuditRecord').mockRejectedValueOnce(new Error('upd boom'));
            await expect(service.markSessionFailed('911111', 'x', 'e')).rejects.toThrow('upd boom');
        });
    });

    describe('revokeSession', () => {
        it('marks the session revoked with reason', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'rev-me' }));
            const r = await service.revokeSession('911111', 'rev-me', 'compromised');
            expect(r?.status).toBe(SessionStatus.REVOKED);
            expect(r?.revocationReason).toBe('compromised');
            expect(r?.isActive).toBe(false);
        });

        it('uses default reason', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'rev2' }));
            const r = await service.revokeSession('911111', 'rev2');
            expect(r?.revocationReason).toBe('manual_revocation');
        });

        it('rethrows when update throws', async () => {
            jest.spyOn(service, 'updateAuditRecord').mockRejectedValueOnce(new Error('rev boom'));
            await expect(service.revokeSession('911111', 'x')).rejects.toThrow('rev boom');
        });
    });

    describe('getSessionsFormobile', () => {
        it('returns empty array for invalid mobile', async () => {
            expect(await service.getSessionsFormobile('')).toEqual([]);
            expect(await service.getSessionsFormobile('  ')).toEqual([]);
        });

        it('returns all sessions sorted newest first', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 's1' }));
            await service.createAuditRecord(baseCreate({ sessionString: 's2' }));
            const all = await service.getSessionsFormobile('911111');
            expect(all.length).toBe(2);
        });

        it('filters to active only when requested', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'active1' }));
            await service.createAuditRecord(baseCreate({ sessionString: 'failed1' }));
            await service.markSessionFailed('911111', 'failed1', 'err');
            const active = await service.getSessionsFormobile('911111', true);
            expect(active.length).toBe(1);
            expect(active[0].sessionString).toBe('active1');
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'find').mockImplementationOnce(() => { throw new Error('find boom'); });
            await expect(service.getSessionsFormobile('911111')).rejects.toThrow('find boom');
        });
    });

    describe('getLatestActiveSession', () => {
        it('returns null when none exist', async () => {
            expect(await service.getLatestActiveSession('911111')).toBeNull();
        });

        it('returns the latest active session', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'old' }));
            await service.createAuditRecord(baseCreate({ sessionString: 'new' }));
            const r = await service.getLatestActiveSession('911111');
            expect(r).toBeTruthy();
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'findOne').mockImplementationOnce(() => { throw new Error('findone boom'); });
            await expect(service.getLatestActiveSession('911111')).rejects.toThrow('findone boom');
        });
    });

    describe('querySessionAudits', () => {
        beforeEach(async () => {
            await service.createAuditRecord(baseCreate({ mobile: '911111', sessionString: 'q1', creationMethod: SessionCreationMethod.USER_MOBILE }));
            await service.createAuditRecord(baseCreate({ mobile: '922222', sessionString: 'q2', creationMethod: SessionCreationMethod.OLD_SESSION }));
        });

        it('applies all filters', async () => {
            const res = await service.querySessionAudits({
                mobile: '911111',
                status: SessionStatus.CREATED,
                creationMethod: SessionCreationMethod.USER_MOBILE,
                isActive: true,
                limit: 10,
                offset: 0,
                startDate: new Date(Date.now() - 86400000),
                endDate: new Date(Date.now() + 86400000),
            });
            expect(res.total).toBe(1);
            expect(res.sessions[0].mobile).toBe('911111');
            expect(res.page).toBe(1);
        });

        it('uses default limit/offset when omitted', async () => {
            const res = await service.querySessionAudits({});
            expect(res.total).toBe(2);
            expect(res.limit).toBe(20);
        });

        it('filters by isActive false', async () => {
            await service.markSessionFailed('911111', 'q1', 'x');
            const res = await service.querySessionAudits({ isActive: false });
            expect(res.total).toBe(1);
        });

        it('applies only startDate', async () => {
            const res = await service.querySessionAudits({ startDate: new Date(Date.now() - 86400000) });
            expect(res.total).toBe(2);
        });

        it('applies only endDate', async () => {
            const res = await service.querySessionAudits({ endDate: new Date(Date.now() + 86400000) });
            expect(res.total).toBe(2);
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'countDocuments').mockImplementationOnce(() => { throw new Error('count boom'); });
            await expect(service.querySessionAudits({})).rejects.toThrow('count boom');
        });
    });

    describe('getSessionStats', () => {
        it('returns zeroed stats when empty', async () => {
            const stats = await service.getSessionStats();
            expect(stats.totalSessions).toBe(0);
            expect(stats.creationMethodBreakdown).toEqual({});
            expect(stats.dateRange.start).toBeInstanceOf(Date);
        });

        it('aggregates by status and creation method', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'a', creationMethod: SessionCreationMethod.USER_MOBILE }));
            const created = await service.createAuditRecord(baseCreate({ sessionString: 'b', creationMethod: SessionCreationMethod.OLD_SESSION }));
            await model.updateOne({ _id: (created as any)._id }, { $set: { status: SessionStatus.ACTIVE } });

            const stats = await service.getSessionStats('911111', 30);
            expect(stats.totalSessions).toBe(2);
            expect(stats.activeSessions).toBe(1);
            expect(stats.creationMethodBreakdown[SessionCreationMethod.USER_MOBILE]).toBe(1);
            expect(stats.creationMethodBreakdown[SessionCreationMethod.OLD_SESSION]).toBe(1);
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'aggregate').mockImplementationOnce(() => { throw new Error('agg boom'); });
            await expect(service.getSessionStats()).rejects.toThrow('agg boom');
        });
    });

    describe('cleanupOldSessions', () => {
        it('deletes old inactive sessions', async () => {
            const old = await service.createAuditRecord(baseCreate({ sessionString: 'old' }));
            // Bypass mongoose timestamps middleware by writing through the raw collection
            await connection.collection(model.collection.name).updateOne(
                { _id: (old as any)._id },
                { $set: { isActive: false, createdAt: new Date(Date.now() - 200 * 86400000) } },
                { timestamps: false } as any,
            );
            const res = await service.cleanupOldSessions(90);
            expect(res.deletedCount).toBe(1);
        });

        it('keeps recent / active sessions', async () => {
            await service.createAuditRecord(baseCreate());
            const res = await service.cleanupOldSessions(90);
            expect(res.deletedCount).toBe(0);
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'deleteMany').mockImplementationOnce(() => { throw new Error('del boom'); });
            await expect(service.cleanupOldSessions()).rejects.toThrow('del boom');
        });
    });

    describe('findRecentSessions', () => {
        it('returns empty for invalid mobile', async () => {
            expect(await service.findRecentSessions('')).toEqual([]);
        });

        it('coerces out-of-range days to default and returns recent sessions', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'recent' }));
            const r = await service.findRecentSessions('911111', 999);
            expect(r.length).toBe(1);
        });

        it('handles days <= 0 by defaulting', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'recent2' }));
            const r = await service.findRecentSessions('911111', 0);
            expect(r.length).toBe(1);
        });

        it('returns recent sessions with valid days', async () => {
            await service.createAuditRecord(baseCreate({ sessionString: 'recent3' }));
            const r = await service.findRecentSessions('911111', 30);
            expect(r.length).toBe(1);
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'find').mockImplementationOnce(() => { throw new Error('recent boom'); });
            await expect(service.findRecentSessions('911111')).rejects.toThrow('recent boom');
        });
    });

    describe('markExpiredSessions', () => {
        it('marks inactive sessions as expired', async () => {
            const rec = await service.createAuditRecord(baseCreate({ sessionString: 'stale' }));
            await model.updateOne(
                { _id: (rec as any)._id },
                { $set: { lastUsedAt: new Date(Date.now() - 30 * 86400000) } },
            );
            const res = await service.markExpiredSessions(7);
            expect(res.modifiedCount).toBe(1);
            const updated = await model.findById((rec as any)._id);
            expect(updated?.status).toBe(SessionStatus.EXPIRED);
        });

        it('leaves recently used sessions active', async () => {
            await service.createAuditRecord(baseCreate());
            const res = await service.markExpiredSessions(7);
            expect(res.modifiedCount).toBe(0);
        });

        it('rethrows on db error', async () => {
            jest.spyOn(model, 'updateMany').mockImplementationOnce(() => { throw new Error('expire boom'); });
            await expect(service.markExpiredSessions()).rejects.toThrow('expire boom');
        });
    });
});
