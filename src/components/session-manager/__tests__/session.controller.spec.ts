import { HttpException, HttpStatus } from '@nestjs/common';
import { SessionController } from '../session.controller';

function makeStubService(overrides: any = {}) {
    return {
        findRecentValidSession: jest.fn(),
        updateSessionLastUsed: jest.fn(),
        createSession: jest.fn(),
        getSessionAuditHistory: jest.fn(),
        getOldestSessionOrCreate: jest.fn(),
        ...overrides,
    };
}

describe('SessionController', () => {
    let svc: any;
    let controller: SessionController;

    beforeEach(() => {
        svc = makeStubService();
        controller = new SessionController(svc as any);
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => jest.restoreAllMocks());

    describe('createSession', () => {
        it('throws 400 when neither mobile nor session provided', async () => {
            await expect(controller.createSession({} as any)).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });
        });

        it('returns existing valid session when found and not forceNew', async () => {
            svc.findRecentValidSession.mockResolvedValue({ success: true, session: { sessionString: 'sess-1' } });
            svc.updateSessionLastUsed.mockResolvedValue({ success: true });

            const res = await controller.createSession({ mobile: '123' } as any);
            expect(res).toEqual({
                success: true,
                message: 'Valid session found from this month',
                session: 'sess-1',
                isNew: false,
            });
            expect(svc.updateSessionLastUsed).toHaveBeenCalledWith('123', 'sess-1');
        });

        it('continues when updateSessionLastUsed throws (swallowed)', async () => {
            svc.findRecentValidSession.mockResolvedValue({ success: true, session: { sessionString: 'sess-2' } });
            svc.updateSessionLastUsed.mockRejectedValue(new Error('update failed'));

            const res = await controller.createSession({ mobile: '123' } as any);
            expect(res.success).toBe(true);
            expect(res.session).toBe('sess-2');
        });

        it('creates new session when no valid recent session found', async () => {
            svc.findRecentValidSession.mockResolvedValue({ success: false });
            svc.createSession.mockResolvedValue({ success: true, session: 'new-sess' });

            const res = await controller.createSession({ mobile: '123' } as any);
            expect(res).toEqual({
                success: true,
                message: 'Session created successfully',
                session: 'new-sess',
                isNew: true,
            });
            expect(svc.createSession).toHaveBeenCalledWith({ mobile: '123', oldSession: undefined });
        });

        it('skips recent lookup when forceNew is true', async () => {
            svc.createSession.mockResolvedValue({ success: true, session: 'forced' });
            const res = await controller.createSession({ mobile: '123', forceNew: true } as any);
            expect(res.isNew).toBe(true);
            expect(svc.findRecentValidSession).not.toHaveBeenCalled();
        });

        it('skips recent lookup when only session provided (no mobile)', async () => {
            svc.createSession.mockResolvedValue({ success: true, session: 'from-session' });
            const res = await controller.createSession({ session: 'oldsess' } as any);
            expect(res.isNew).toBe(true);
            expect(svc.findRecentValidSession).not.toHaveBeenCalled();
            expect(svc.createSession).toHaveBeenCalledWith({ mobile: undefined, oldSession: 'oldsess' });
        });

        it('throws 400 when createSession fails and not retryable', async () => {
            svc.findRecentValidSession.mockResolvedValue({ success: false });
            svc.createSession.mockResolvedValue({ success: false, error: 'boom', retryable: false });

            await expect(controller.createSession({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });
        });

        it('throws 429 when createSession fails and retryable', async () => {
            svc.findRecentValidSession.mockResolvedValue({ success: false });
            svc.createSession.mockResolvedValue({ success: false, error: 'rate', retryable: true });

            await expect(controller.createSession({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.TOO_MANY_REQUESTS,
            });
        });

        it('rethrows HttpException unchanged from inner call', async () => {
            const inner = new HttpException({ success: false, message: 'custom' }, HttpStatus.BAD_REQUEST);
            svc.findRecentValidSession.mockRejectedValue(inner);
            await expect(controller.createSession({ mobile: '123' } as any)).rejects.toBe(inner);
        });

        it('wraps non-HttpException into 500', async () => {
            svc.findRecentValidSession.mockRejectedValue(new Error('db down'));
            await expect(controller.createSession({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
            });
        });

        it('wraps non-HttpException with no message into 500 with default', async () => {
            svc.findRecentValidSession.mockResolvedValue({ success: false });
            svc.createSession.mockImplementation(() => { throw {}; });
            try {
                await controller.createSession({ mobile: '123' } as any);
                fail('should throw');
            } catch (e: any) {
                expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
                expect(e.getResponse().message).toBe('Failed to create/retrieve session');
            }
        });
    });

    describe('searchAudit', () => {
        it('returns audit records for a mobile with default limit/offset', async () => {
            svc.getSessionAuditHistory.mockResolvedValue({ success: true, data: [{ a: 1 }], total: 1 });
            const res = await controller.searchAudit('123');
            expect(res).toEqual({
                success: true,
                data: [{ a: 1 }],
                total: 1,
                message: 'Retrieved 1 audit records',
            });
            expect(svc.getSessionAuditHistory).toHaveBeenCalledWith('123', { limit: 10, offset: 0, status: undefined });
        });

        it('parses valid numeric limit/offset and status', async () => {
            svc.getSessionAuditHistory.mockResolvedValue({ success: true, data: [], total: 0 });
            await controller.searchAudit('123', 'active', 5 as any, 2 as any);
            expect(svc.getSessionAuditHistory).toHaveBeenCalledWith('123', { limit: 5, offset: 2, status: 'active' });
        });

        it('falls back to defaults for invalid numeric inputs', async () => {
            svc.getSessionAuditHistory.mockResolvedValue({ success: true, data: [], total: 0 });
            await controller.searchAudit('123', undefined, 'abc' as any, -1 as any);
            expect(svc.getSessionAuditHistory).toHaveBeenCalledWith('123', { limit: 10, offset: 0, status: undefined });
        });

        it('handles result with missing data/total', async () => {
            svc.getSessionAuditHistory.mockResolvedValue({ success: true });
            const res = await controller.searchAudit('123');
            expect(res).toEqual({ success: true, data: [], total: 0, message: 'Retrieved 0 audit records' });
        });

        it('throws 400 when no mobile provided', async () => {
            await expect(controller.searchAudit()).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
        });

        it('throws 400 when service result is unsuccessful', async () => {
            svc.getSessionAuditHistory.mockResolvedValue({ success: false, error: 'fail' });
            await expect(controller.searchAudit('123')).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
        });

        it('throws 400 with default message when service unsuccessful without error', async () => {
            svc.getSessionAuditHistory.mockResolvedValue({ success: false });
            try {
                await controller.searchAudit('123');
                fail('should throw');
            } catch (e: any) {
                expect(e.getResponse().message).toBe('Failed to retrieve audit records');
            }
        });

        it('rethrows HttpException from service', async () => {
            const inner = new HttpException({ success: false }, HttpStatus.BAD_REQUEST);
            svc.getSessionAuditHistory.mockRejectedValue(inner);
            await expect(controller.searchAudit('123')).rejects.toBe(inner);
        });

        it('wraps non-HttpException into 500', async () => {
            svc.getSessionAuditHistory.mockRejectedValue(new Error('crash'));
            await expect(controller.searchAudit('123')).rejects.toMatchObject({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
            });
        });
    });

    describe('getOldestSessionOrCreate', () => {
        it('throws 400 when mobile is empty', async () => {
            await expect(controller.getOldestSessionOrCreate({ mobile: '  ' } as any)).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });
        });

        it('throws 400 when mobile is missing', async () => {
            await expect(controller.getOldestSessionOrCreate({} as any)).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });
        });

        it('returns data on success', async () => {
            const data = { session: 's', sessionAge: 1, isNew: false, usageCount: 2, lastUsedAt: 'x', createdAt: 'y' };
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: true, data });
            const res = await controller.getOldestSessionOrCreate({ mobile: ' 123 ' } as any);
            expect(res).toBe(data);
            expect(svc.getOldestSessionOrCreate).toHaveBeenCalledWith({ mobile: '123', allowFallback: true, maxAgeDays: 180 });
        });

        it('passes allowFallback=false and custom maxAgeDays', async () => {
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: true, data: {} });
            await controller.getOldestSessionOrCreate({ mobile: '123', allowFallback: false, maxAgeDays: 30 } as any);
            expect(svc.getOldestSessionOrCreate).toHaveBeenCalledWith({ mobile: '123', allowFallback: false, maxAgeDays: 30 });
        });

        it('defaults maxAgeDays when out of range', async () => {
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: true, data: {} });
            await controller.getOldestSessionOrCreate({ mobile: '123', maxAgeDays: 999 } as any);
            expect(svc.getOldestSessionOrCreate).toHaveBeenCalledWith({ mobile: '123', allowFallback: true, maxAgeDays: 180 });
        });

        it('maps NO_SESSION_FOUND to 404', async () => {
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: false, code: 'NO_SESSION_FOUND', message: 'none' });
            await expect(controller.getOldestSessionOrCreate({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.NOT_FOUND,
            });
        });

        it('maps FALLBACK_DISABLED to 404', async () => {
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: false, code: 'FALLBACK_DISABLED', message: 'no fb' });
            await expect(controller.getOldestSessionOrCreate({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.NOT_FOUND,
            });
        });

        it('maps RATE_LIMIT_EXCEEDED to 429', async () => {
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: false, code: 'RATE_LIMIT_EXCEEDED', message: 'rl', retryable: true });
            await expect(controller.getOldestSessionOrCreate({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.TOO_MANY_REQUESTS,
            });
        });

        it('maps unknown code to 400', async () => {
            svc.getOldestSessionOrCreate.mockResolvedValue({ success: false, code: 'WHATEVER', message: 'bad' });
            await expect(controller.getOldestSessionOrCreate({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });
        });

        it('rethrows HttpException from service', async () => {
            const inner = new HttpException({ success: false }, HttpStatus.NOT_FOUND);
            svc.getOldestSessionOrCreate.mockRejectedValue(inner);
            await expect(controller.getOldestSessionOrCreate({ mobile: '123' } as any)).rejects.toBe(inner);
        });

        it('wraps non-HttpException into 500', async () => {
            svc.getOldestSessionOrCreate.mockRejectedValue(new Error('explode'));
            await expect(controller.getOldestSessionOrCreate({ mobile: '123' } as any)).rejects.toMatchObject({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
            });
        });
    });
});
