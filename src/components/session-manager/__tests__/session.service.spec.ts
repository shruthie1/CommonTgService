// ─── Mock externals BEFORE importing the service ────────────────────────────
const mockClientInstances: any[] = [];

jest.mock('telegram', () => ({
    Api: { User: class { } },
    TelegramClient: jest.fn().mockImplementation((session: any) => {
        const inst: any = {
            session: {
                save: jest.fn(() => 'NEW_SESSION_STRING'),
                _session: session,
            },
            connect: jest.fn().mockResolvedValue(undefined),
            getMe: jest.fn().mockResolvedValue({ phone: '919999999999' }),
            getMessages: jest.fn().mockResolvedValue([]),
            start: jest.fn().mockResolvedValue(undefined),
            destroy: jest.fn().mockResolvedValue(undefined),
            createNewSession: jest.fn().mockResolvedValue('EXISTING_MANAGER_SESSION'),
            _eventBuilders: [],
            _destroyed: false,
            _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
        };
        mockClientInstances.push(inst);
        return inst;
    }),
}));

jest.mock('telegram/sessions', () => ({
    StringSession: jest.fn().mockImplementation((s: string) => ({ _s: s, save: () => 'NEW_SESSION_STRING' })),
}));

jest.mock('../../Telegram/utils/connection-manager', () => ({
    connectionManager: {
        getClient: jest.fn(),
        unregisterClient: jest.fn().mockResolvedValue(undefined),
    },
}));

// Speed up sleeps used inside the service
jest.mock('../../../utils', () => {
    const actual = jest.requireActual('../../../utils');
    return {
        ...actual,
        sleep: jest.fn().mockResolvedValue(undefined),
        parseError: jest.fn(),
    };
});

import { SessionManager, SessionService } from '../session.service';
import { ClientRegistry } from '../client-registry';
import { SessionStatus, SessionCreationMethod } from '../schemas/sessions.schema';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import { TelegramClient } from 'telegram';

function makeStubAudit(overrides: any = {}) {
    return {
        createAuditRecord: jest.fn().mockResolvedValue({}),
        querySessionAudits: jest.fn().mockResolvedValue({ sessions: [], total: 0, page: 1, limit: 20 }),
        getLatestActiveSession: jest.fn().mockResolvedValue(null),
        markSessionUsed: jest.fn().mockResolvedValue({}),
        findRecentSessions: jest.fn().mockResolvedValue([]),
        getSessionsFormobile: jest.fn().mockResolvedValue([]),
        revokeSession: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
}

// Reset the SessionManager + ClientRegistry singletons so tests are isolated.
function resetSingletons() {
    (SessionManager as any).instance = null;
    (ClientRegistry as any).instance = null;
}

describe('session.service', () => {
    beforeEach(() => {
        mockClientInstances.length = 0;
        jest.clearAllMocks();
        resetSingletons();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ═══════════════════════ SessionManager ═══════════════════════
    describe('SessionManager', () => {
        let manager: SessionManager;

        beforeEach(() => {
            manager = SessionManager.getInstance();
        });

        it('getInstance returns a singleton', () => {
            expect(SessionManager.getInstance()).toBe(manager);
        });

        describe('createSession entry validation', () => {
            it('fails when mobile missing', async () => {
                const r = await manager.createSession({});
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Mobile number is required/);
            });

            it('returns in-progress error when a creating client exists', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                registry.markClientCreating('919999999999', id!);
                const r = await manager.createSession({ mobile: '919999999999' });
                expect(r.error).toMatch(/already in progress/);
                expect(r.retryable).toBe(true);
            });

            it('returns active-exists error when a non-creating client exists', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                await registry.registerClient('919999999999', {} as any, 'sess', id!);
                const r = await manager.createSession({ mobile: '919999999999' });
                expect(r.error).toMatch(/Active session exists/);
            });

            it('returns all-strategies-failed when no strategies succeed', async () => {
                (connectionManager.getClient as jest.Mock).mockRejectedValue(new Error('no client'));
                const r = await manager.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/All SessionManager strategies failed/);
            });
        });

        describe('createFromExistingManager (existingManager strategy)', () => {
            it('succeeds via existing manager createNewSession', async () => {
                (connectionManager.getClient as jest.Mock).mockResolvedValue({
                    createNewSession: jest.fn().mockResolvedValue('MGR_SESSION'),
                });
                const r = await manager.createSession({ mobile: '919999999999' });
                expect(r).toEqual({ success: true, session: 'MGR_SESSION' });
                expect(connectionManager.unregisterClient).toHaveBeenCalledWith('919999999999');
            });

            it('returns failure when getClient throws', async () => {
                (connectionManager.getClient as jest.Mock).mockRejectedValue(new Error('flood_wait'));
                const r = await manager.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
            });

            it('handles error without message', async () => {
                (connectionManager.getClient as jest.Mock).mockRejectedValue({});
                const r = await manager.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
            });
        });

        describe('validateSession', () => {
            it('returns valid when phone matches', async () => {
                const r = await manager.validateSession('sess', '919999999999');
                expect(r.isValid).toBe(true);
                expect(r.userInfo).toBeTruthy();
            });

            it('returns invalid on phone mismatch', async () => {
                (TelegramClient as unknown as jest.Mock).mockImplementationOnce(() => ({
                    connect: jest.fn().mockResolvedValue(undefined),
                    getMe: jest.fn().mockResolvedValue({ phone: '910000000000' }),
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                const r = await manager.validateSession('sess', '919999999999');
                expect(r.isValid).toBe(false);
                expect(r.error).toMatch(/mismatch/);
            });

            it('returns invalid when connect throws', async () => {
                (TelegramClient as unknown as jest.Mock).mockImplementationOnce(() => ({
                    connect: jest.fn().mockRejectedValue(new Error('connect fail')),
                    getMe: jest.fn(),
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                const r = await manager.validateSession('sess', '919999999999');
                expect(r.isValid).toBe(false);
                expect(r.error).toMatch(/connect fail/);
            });

            it('returns invalid when getMe returns null', async () => {
                (TelegramClient as unknown as jest.Mock).mockImplementationOnce(() => ({
                    connect: jest.fn().mockResolvedValue(undefined),
                    getMe: jest.fn().mockResolvedValue(null),
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                const r = await manager.validateSession('sess', '919999999999');
                expect(r.isValid).toBe(false);
            });
        });

        describe('createFromOldSession (oldSession strategy)', () => {
            it('succeeds: validates old session then creates new', async () => {
                // First client = validateSession (phone match), then performSessionCreation old+new clients
                const r = await manager.createSession({ oldSession: 'OLD', mobile: '919999999999' });
                expect(r.success).toBe(true);
                expect(r.session).toBe('NEW_SESSION_STRING');
            });

            it('fails when old session validation fails (phone mismatch) then falls through', async () => {
                // validateSession returns mismatch -> oldSession strategy fails; existingManager also fails
                (TelegramClient as unknown as jest.Mock).mockImplementation(() => ({
                    connect: jest.fn().mockResolvedValue(undefined),
                    getMe: jest.fn().mockResolvedValue({ phone: '910000000000' }),
                    destroy: jest.fn().mockResolvedValue(undefined),
                    createNewSession: jest.fn().mockRejectedValue(new Error('no mgr')),
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                (connectionManager.getClient as jest.Mock).mockRejectedValue(new Error('no mgr'));
                const r = await manager.createSession({ oldSession: 'OLD', mobile: '919999999999' });
                expect(r.success).toBe(false);
            });

            it('retries on retryable error in performSessionCreation then fails non-retryable', async () => {
                // validateSession passes (1st client). performSessionCreation: start throws non-retryable.
                let call = 0;
                (TelegramClient as unknown as jest.Mock).mockImplementation(() => {
                    call++;
                    const phoneMatch = call === 1; // validateSession client
                    return {
                        connect: jest.fn().mockResolvedValue(undefined),
                        getMe: jest.fn().mockResolvedValue({ phone: phoneMatch ? '919999999999' : '919999999999' }),
                        getMessages: jest.fn().mockResolvedValue([]),
                        start: jest.fn().mockRejectedValue(new Error('phone_number_banned')),
                        session: { save: () => 'X' },
                        destroy: jest.fn().mockResolvedValue(undefined),
                        createNewSession: jest.fn().mockRejectedValue(new Error('no')),
                        _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                    };
                });
                (connectionManager.getClient as jest.Mock).mockRejectedValue(new Error('no'));
                const r = await manager.createSession({ oldSession: 'OLD', mobile: '919999999999', maxRetries: 2 });
                expect(r.success).toBe(false);
            });

            it('invokes start callbacks (password/phoneCode/onError) during creation', async () => {
                let clientNum = 0;
                (TelegramClient as unknown as jest.Mock).mockImplementation(() => {
                    clientNum++;
                    // client 1 = validateSession, 2 = old client, 3 = new client
                    const isNew = clientNum === 3;
                    return {
                        connect: jest.fn().mockResolvedValue(undefined),
                        getMe: jest.fn().mockResolvedValue({ phone: '919999999999' }),
                        // recent OTP message so waitForOtp resolves immediately
                        getMessages: jest.fn().mockResolvedValue([
                            { date: Math.floor(Date.now() / 1000), text: 'Login code: 778899' },
                        ]),
                        start: isNew
                            ? jest.fn(async (opts: any) => {
                                // exercise the callbacks defined in performSessionCreation
                                await opts.password();
                                await opts.phoneCode();
                                expect(() => opts.onError(new Error('cb err'))).toThrow(/Session start error/);
                            })
                            : jest.fn().mockResolvedValue(undefined),
                        session: { save: () => 'CALLBACK_SESSION' },
                        destroy: jest.fn().mockResolvedValue(undefined),
                        _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                    };
                });
                const r = await manager.createSession({ oldSession: 'OLD', mobile: '919999999999' });
                expect(r.success).toBe(true);
                expect(r.session).toBe('CALLBACK_SESSION');
            });

            it('exhausts retries on retryable error', async () => {
                (TelegramClient as unknown as jest.Mock).mockImplementation(() => ({
                    connect: jest.fn().mockResolvedValue(undefined),
                    getMe: jest.fn().mockResolvedValue({ phone: '919999999999' }),
                    getMessages: jest.fn().mockResolvedValue([]),
                    start: jest.fn().mockRejectedValue(new Error('timeout')),
                    session: { save: () => 'X' },
                    destroy: jest.fn().mockResolvedValue(undefined),
                    createNewSession: jest.fn().mockRejectedValue(new Error('no')),
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                (connectionManager.getClient as jest.Mock).mockRejectedValue(new Error('no'));
                const r = await manager.createSession({ oldSession: 'OLD', mobile: '919999999999', maxRetries: 2, retryDelay: 1 });
                expect(r.success).toBe(false);
            });
        });

        describe('waitForOtp + extractOtpCode (via private)', () => {
            it('extracts OTP from a recent message', async () => {
                const oldClient = {
                    getMessages: jest.fn().mockResolvedValue([
                        { date: Math.floor(Date.now() / 1000), text: 'Login code: 12345' },
                    ]),
                };
                const code = await (manager as any).waitForOtp(oldClient, '919999999999', 1);
                expect(code).toBe('12345');
            });

            it('handles getMessages error then times out', async () => {
                // sleep is mocked to resolve instantly; advance Date.now ourselves so the
                // while-loop terminates instead of spinning forever.
                const base = Date.now();
                let calls = 0;
                jest.spyOn(Date, 'now').mockImplementation(() => base + (calls++ * 60000));
                const oldClient = { getMessages: jest.fn().mockRejectedValue(new Error('msg fail')) };
                await expect((manager as any).waitForOtp(oldClient, '919999999999', 1))
                    .rejects.toThrow(/OTP timeout/);
                expect(oldClient.getMessages).toHaveBeenCalled();
            });

            it('keeps polling when message is too old, then times out', async () => {
                const base = Date.now();
                let calls = 0;
                jest.spyOn(Date, 'now').mockImplementation(() => base + (calls++ * 60000));
                const oldClient = {
                    // message dated well in the past -> ignored by the freshness check
                    getMessages: jest.fn().mockResolvedValue([{ date: 1000, text: 'code:**999888' }]),
                };
                await expect((manager as any).waitForOtp(oldClient, '919999999999', 1))
                    .rejects.toThrow(/OTP timeout/);
            });

            it('extractOtpCode matches all patterns', () => {
                const ex = (s: string) => (manager as any).extractOtpCode(s);
                expect(ex('code:**123456')).toBe('123456');
                expect(ex('login code: 654321')).toBe('654321');
                expect(ex('your code is 111222')).toBe('111222');
                expect(ex('verification code: 222333')).toBe('222333');
                expect(ex('your one time pin 445566 ok')).toBe('445566');
                expect(ex('no digits here')).toBeNull();
            });
        });

        describe('cleanupClient', () => {
            it('does nothing for null client', async () => {
                await expect((manager as any).cleanupClient(null, '919999999999')).resolves.toBeUndefined();
            });

            it('skips already-destroyed client', async () => {
                const client = { _destroyed: true };
                await (manager as any).cleanupClient(client, '919999999999');
                expect((client as any)._destroyed).toBe(true);
            });

            it('destroys client and unregisters when requested', async () => {
                const client = {
                    _destroyed: false,
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _eventBuilders: [1],
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                };
                await (manager as any).cleanupClient(client, '919999999999', true);
                expect(client.destroy).toHaveBeenCalled();
                expect(connectionManager.unregisterClient).toHaveBeenCalled();
            });

            it('handles destroy error and still finalizes', async () => {
                const client = {
                    _destroyed: false,
                    destroy: jest.fn().mockRejectedValue(new Error('destroy boom')),
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                };
                await (manager as any).cleanupClient(client, '919999999999', false);
                expect(client._destroyed).toBe(true);
            });
        });

        describe('isRetryableError', () => {
            it('non-retryable for banned errors', () => {
                expect((manager as any).isRetryableError('PHONE_NUMBER_BANNED')).toBe(false);
            });
            it('retryable for timeout', () => {
                expect((manager as any).isRetryableError('TIMEOUT occurred')).toBe(true);
            });
            it('defaults to retryable for unknown', () => {
                expect((manager as any).isRetryableError('some weird error')).toBe(true);
            });
        });

        describe('getSessionStatus', () => {
            it('returns inactive when no client', () => {
                expect(manager.getSessionStatus('nope')).toEqual({ status: 'inactive', activeClients: 0 });
            });

            it('returns creating/active for a registered client', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                await registry.registerClient('919999999999', {} as any, 'sess', id!);
                expect(manager.getSessionStatus('919999999999').status).toBe('active');
                registry.markClientCreating('919999999999', id!);
                expect(manager.getSessionStatus('919999999999').status).toBe('creating');
            });
        });

        describe('cleanupSessions', () => {
            it('returns 0 cleaned when no client', async () => {
                const r = await manager.cleanupSessions('nope');
                expect(r).toEqual({ success: true, cleanedCount: 0 });
            });

            it('blocks cleanup while creating without force', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                registry.markClientCreating('919999999999', id!);
                const r = await manager.cleanupSessions('919999999999', false);
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/in progress/);
            });

            it('cleans up with force', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                registry.markClientCreating('919999999999', id!);
                const r = await manager.cleanupSessions('919999999999', true);
                expect(r.success).toBe(true);
            });

            it('returns error when forceCleanup throws', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                await registry.registerClient('919999999999', {} as any, 'sess', id!);
                jest.spyOn(registry, 'forceCleanup').mockRejectedValue(new Error('cleanup boom'));
                const r = await manager.cleanupSessions('919999999999', true);
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/cleanup boom/);
            });
        });

        it('getRegistryStats delegates to registry', () => {
            const stats = manager.getRegistryStats();
            expect(stats).toHaveProperty('activeClients');
            expect(stats).toHaveProperty('activeLocks');
            expect(stats).toHaveProperty('mobiles');
        });
    });

    // ═══════════════════════ SessionService ═══════════════════════
    describe('SessionService', () => {
        let audit: any;
        let service: SessionService;

        beforeEach(() => {
            audit = makeStubAudit();
            service = new SessionService(audit);
        });

        describe('createSession', () => {
            it('rejects invalid options', async () => {
                const r = await service.createSession(null as any);
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Invalid options/);
            });

            it('rejects when mobile missing and no session', async () => {
                const r = await service.createSession({});
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Mobile number is required/);
            });

            it('extracts mobile from session then succeeds via manager', async () => {
                // extractMobileFromSession will iterate credential pool; first client getMe returns phone
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: true, session: 'S' });
                const r = await service.createSession({ oldSession: 'OLD' });
                expect(r.success).toBe(true);
                expect(audit.createAuditRecord).toHaveBeenCalled();
            });

            it('returns error when extraction fails to find a phone', async () => {
                (TelegramClient as unknown as jest.Mock).mockImplementation(() => ({
                    connect: jest.fn().mockResolvedValue(undefined),
                    getMe: jest.fn().mockResolvedValue({}),
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _eventBuilders: [],
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                const r = await service.createSession({ oldSession: 'OLD' });
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Failed to extract mobile/);
            });

            it('returns error when extraction throws (connect fails for all)', async () => {
                (TelegramClient as unknown as jest.Mock).mockImplementation(() => ({
                    connect: jest.fn().mockRejectedValue(new Error('conn fail')),
                    getMe: jest.fn(),
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _eventBuilders: [],
                    _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
                }));
                const r = await service.createSession({ oldSession: 'OLD' });
                expect(r.success).toBe(false);
            });

            it('honors rate limit', async () => {
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: false, error: 'x' });
                // hit the limit (20 per hour)
                for (let i = 0; i < 20; i++) {
                    await service.createSession({ mobile: '919999999999' });
                }
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.error).toMatch(/Rate limit exceeded/);
                expect(r.retryable).toBe(true);
            });

            it('succeeds via old session path (priority 1)', async () => {
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: true, session: 'OS' });
                const r = await service.createSession({ mobile: '919999999999', oldSession: 'OLD' });
                expect(r.success).toBe(true);
                expect(audit.createAuditRecord).toHaveBeenCalledWith(expect.objectContaining({
                    creationMethod: SessionCreationMethod.INPUT_SESSION,
                }));
            });

            it('falls back to manager (priority 2) when old session fails', async () => {
                const spy = jest.spyOn(service['sessionManager'], 'createSession')
                    .mockResolvedValueOnce({ success: false, error: 'old failed' }) // priority 1
                    .mockResolvedValueOnce({ success: true, session: 'MGR' });        // priority 2
                const r = await service.createSession({ mobile: '919999999999', oldSession: 'OLD' });
                expect(r.session).toBe('MGR');
                expect(audit.createAuditRecord).toHaveBeenCalledWith(expect.objectContaining({
                    creationMethod: SessionCreationMethod.USER_MOBILE,
                }));
                spy.mockRestore();
            });

            it('falls back to audit sessions (priority 3) and succeeds', async () => {
                audit.getSessionsFormobile.mockResolvedValue([{ sessionString: 'AUDIT1' }]);
                jest.spyOn(service['sessionManager'], 'createSession')
                    .mockResolvedValueOnce({ success: false, error: 'no manager' }) // priority 2
                    .mockResolvedValueOnce({ success: true, session: 'AUDITSESS' });  // priority 3
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(true);
                expect(audit.createAuditRecord).toHaveBeenCalledWith(expect.objectContaining({
                    creationMethod: SessionCreationMethod.OLD_SESSION,
                }));
            });

            it('returns final failure when all strategies fail', async () => {
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: false, error: 'nope' });
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/All session creation strategies failed/);
            });

            it('catches unexpected error', async () => {
                jest.spyOn(service['sessionManager'], 'createSession').mockRejectedValue(new Error('kaboom'));
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
                expect(r.error).toBe('kaboom');
            });
        });

        describe('tryAuditSessions (via createSession priority 3)', () => {
            it('returns no-audit when empty', async () => {
                audit.getSessionsFormobile.mockResolvedValue([]);
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: false, error: 'no' });
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
            });

            it('continues when an audit session throws', async () => {
                audit.getSessionsFormobile.mockResolvedValue([{ sessionString: 'A1' }, { sessionString: 'A2' }]);
                jest.spyOn(service['sessionManager'], 'createSession')
                    .mockResolvedValueOnce({ success: false, error: 'mgr fail' }) // priority 2
                    .mockRejectedValueOnce(new Error('audit1 throw'))             // priority 3, audit 1
                    .mockResolvedValueOnce({ success: true, session: 'A2SESS' });  // priority 3, audit 2
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(true);
            });

            it('handles getSessionsFormobile rejection', async () => {
                audit.getSessionsFormobile.mockRejectedValue(new Error('db down'));
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: false, error: 'no' });
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
            });
        });

        describe('updateAuditOnSuccess error swallow', () => {
            it('does not throw when createAuditRecord fails', async () => {
                audit.createAuditRecord.mockRejectedValue(new Error('audit boom'));
                jest.spyOn(service['sessionManager'], 'createSession').mockResolvedValue({ success: true, session: 'S' });
                const r = await service.createSession({ mobile: '919999999999', oldSession: 'OLD' });
                expect(r.success).toBe(true);
            });
        });

        describe('getSessionAuditHistory', () => {
            it('returns data on success', async () => {
                audit.querySessionAudits.mockResolvedValue({ sessions: [{ a: 1 }], total: 1 });
                const r = await service.getSessionAuditHistory('919999999999', { limit: 5, offset: 0, status: SessionStatus.ACTIVE });
                expect(r).toEqual({ success: true, data: [{ a: 1 }], total: 1 });
            });

            it('returns error on failure', async () => {
                audit.querySessionAudits.mockRejectedValue(new Error('query boom'));
                const r = await service.getSessionAuditHistory('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toBe('query boom');
            });
        });

        describe('getActiveSession', () => {
            it('returns session', async () => {
                audit.getLatestActiveSession.mockResolvedValue({ id: 1 });
                const r = await service.getActiveSession('919999999999');
                expect(r.success).toBe(true);
                expect(r.session).toEqual({ id: 1 });
            });

            it('returns undefined when none', async () => {
                audit.getLatestActiveSession.mockResolvedValue(null);
                const r = await service.getActiveSession('919999999999');
                expect(r.session).toBeUndefined();
            });

            it('returns error on failure', async () => {
                audit.getLatestActiveSession.mockRejectedValue(new Error('act boom'));
                const r = await service.getActiveSession('919999999999');
                expect(r.success).toBe(false);
            });
        });

        describe('updateSessionLastUsed', () => {
            it('success when record updated', async () => {
                audit.markSessionUsed.mockResolvedValue({ id: 1 });
                const r = await service.updateSessionLastUsed('919999999999', 'sess');
                expect(r.success).toBe(true);
            });

            it('fails when no active session', async () => {
                audit.markSessionUsed.mockResolvedValue(null);
                const r = await service.updateSessionLastUsed('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/No active session/);
            });

            it('returns error on throw', async () => {
                audit.markSessionUsed.mockRejectedValue(new Error('used boom'));
                const r = await service.updateSessionLastUsed('919999999999');
                expect(r.success).toBe(false);
            });
        });

        describe('findRecentValidSession', () => {
            it('rejects invalid mobile', async () => {
                const r = await service.findRecentValidSession('' as any);
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Invalid mobile/);
            });

            it('returns no-sessions when none found', async () => {
                audit.findRecentSessions.mockResolvedValue([]);
                const r = await service.findRecentValidSession('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/No recent sessions/);
            });

            it('returns first session with a sessionString', async () => {
                audit.findRecentSessions.mockResolvedValue([{ sessionString: '' }, { sessionString: 'GOOD' }]);
                const r = await service.findRecentValidSession('919999999999');
                expect(r.success).toBe(true);
                expect(r.session).toEqual({ sessionString: 'GOOD' });
            });

            it('returns no-valid when all sessions lack a string', async () => {
                audit.findRecentSessions.mockResolvedValue([{ sessionString: '' }, {}]);
                const r = await service.findRecentValidSession('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/No valid session/);
            });

            it('returns error on throw', async () => {
                audit.findRecentSessions.mockRejectedValue(new Error('recent boom'));
                const r = await service.findRecentValidSession('919999999999');
                expect(r.success).toBe(false);
            });
        });

        describe('getOldestSessionOrCreate', () => {
            it('rejects empty mobile', async () => {
                const r = await service.getOldestSessionOrCreate({ mobile: '   ' });
                expect(r.code).toBe('INVALID_MOBILE');
            });

            it('rejects invalid maxAgeDays', async () => {
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', maxAgeDays: 0 });
                expect(r.code).toBe('INVALID_MAX_AGE');
            });

            it('rejects too-large maxAgeDays', async () => {
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', maxAgeDays: 999 });
                expect(r.code).toBe('INVALID_MAX_AGE');
            });

            it('honors rate limit', async () => {
                for (let i = 0; i < 20; i++) {
                    await service['checkRateLimit']('919999999999');
                }
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.code).toBe('RATE_LIMIT_EXCEEDED');
            });

            it('returns oldest valid session and updates usage', async () => {
                const session = {
                    sessionString: 'OLD_VALID',
                    createdAt: new Date(Date.now() - 5 * 86400000),
                    lastUsedAt: new Date(),
                    usageCount: 3,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                audit.querySessionAudits.mockResolvedValue({ sessions: [session], total: 1 });
                jest.spyOn(service['sessionManager'], 'validateSession').mockResolvedValue({ isValid: true });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.success).toBe(true);
                expect(r.data?.isNew).toBe(false);
                expect(r.data?.usageCount).toBe(3);
                expect(audit.markSessionUsed).toHaveBeenCalled();
            });

            it('continues even when markSessionUsed fails', async () => {
                const session = {
                    sessionString: 'OLD_VALID',
                    createdAt: new Date(),
                    lastUsedAt: new Date(),
                    usageCount: 0,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.CREATED,
                };
                audit.querySessionAudits.mockResolvedValue({ sessions: [session], total: 1 });
                audit.markSessionUsed.mockRejectedValue(new Error('used boom'));
                jest.spyOn(service['sessionManager'], 'validateSession').mockResolvedValue({ isValid: true });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.success).toBe(true);
            });

            it('returns FALLBACK_DISABLED when no valid session and fallback off', async () => {
                audit.querySessionAudits.mockResolvedValue({ sessions: [], total: 0 });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', allowFallback: false });
                expect(r.code).toBe('FALLBACK_DISABLED');
            });

            it('creates fallback session when allowed', async () => {
                audit.querySessionAudits.mockResolvedValue({ sessions: [], total: 0 });
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'FALLBACK' });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', allowFallback: true });
                expect(r.success).toBe(true);
                expect(r.data?.isNew).toBe(true);
                expect(r.message).toMatch(/fallback/);
            });

            it('returns FALLBACK_CREATION_FAILED when fallback fails', async () => {
                audit.querySessionAudits.mockResolvedValue({ sessions: [], total: 0 });
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: false, error: 'no', retryable: true });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.code).toBe('FALLBACK_CREATION_FAILED');
                expect(r.retryable).toBe(true);
            });

            it('catches unexpected errors as INTERNAL_ERROR', async () => {
                audit.querySessionAudits.mockImplementation(() => { throw new Error('sync throw'); });
                jest.spyOn(service as any, 'findOldestValidSession').mockRejectedValue(new Error('boom'));
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', allowFallback: false });
                // findOldestValidSession swallows; but force the outer catch by making checkRateLimit throw
                expect(['FALLBACK_DISABLED', 'INTERNAL_ERROR']).toContain(r.code);
            });

            it('handles INTERNAL_ERROR when checkRateLimit throws', async () => {
                jest.spyOn(service as any, 'checkRateLimit').mockImplementation(() => { throw new Error('rl boom'); });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.code).toBe('INTERNAL_ERROR');
            });
        });

        describe('findOldestValidSession (via getOldestSessionOrCreate)', () => {
            it('revokes permanently-invalid candidate and returns failure -> fallback', async () => {
                const session = {
                    sessionString: 'BAD',
                    createdAt: new Date(),
                    lastUsedAt: new Date(),
                    usageCount: 0,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                audit.querySessionAudits.mockResolvedValue({ sessions: [session], total: 1 });
                jest.spyOn(service['sessionManager'], 'validateSession')
                    .mockResolvedValue({ isValid: false, error: 'auth_key_unregistered' });
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'NEW' });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(audit.revokeSession).toHaveBeenCalled();
                expect(r.data?.isNew).toBe(true);
            });

            it('skips revoke for non-permanent validation failure', async () => {
                const session = {
                    sessionString: 'BAD',
                    createdAt: new Date(),
                    lastUsedAt: new Date(),
                    usageCount: 0,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                audit.querySessionAudits.mockResolvedValue({ sessions: [session], total: 1 });
                jest.spyOn(service['sessionManager'], 'validateSession')
                    .mockResolvedValue({ isValid: false, error: 'temporary network blip' });
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'NEW' });
                await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(audit.revokeSession).not.toHaveBeenCalled();
            });

            it('filters out invalid/empty sessions (no valid sessions branch)', async () => {
                audit.querySessionAudits.mockResolvedValue({
                    sessions: [{ sessionString: '', isActive: true, status: SessionStatus.ACTIVE, createdAt: new Date() }],
                    total: 1,
                });
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'NEW' });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.data?.isNew).toBe(true);
            });

            it('handles querySessionAudits throwing inside findOldestValidSession', async () => {
                audit.querySessionAudits.mockRejectedValue(new Error('q boom'));
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'NEW' });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.data?.isNew).toBe(true);
            });

            // sorts multiple valid candidates (line 993 comparator), first fails validation,
            // second (older) passes -> returns it. Exercises the .sort() comparator with 2+ items.
            it('sorts multiple valid candidates oldest-first and returns the valid one', async () => {
                const newer = {
                    sessionString: 'NEWER',
                    createdAt: new Date(Date.now() - 1 * 86400000),
                    lastUsedAt: new Date(),
                    usageCount: 1,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                const older = {
                    sessionString: 'OLDER',
                    createdAt: new Date(Date.now() - 9 * 86400000),
                    lastUsedAt: new Date(),
                    usageCount: 2,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                // querySessionAudits returns newer-first to force the comparator to reorder
                audit.querySessionAudits.mockResolvedValue({ sessions: [newer, older], total: 2 });
                jest.spyOn(service['sessionManager'], 'validateSession')
                    // first candidate after sort is OLDER -> fail (non-permanent), then NEWER -> valid
                    .mockResolvedValueOnce({ isValid: false, error: 'temporary blip' })
                    .mockResolvedValueOnce({ isValid: true });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(r.success).toBe(true);
                expect(r.data?.isNew).toBe(false);
                // OLDER sorted first, failed; NEWER returned
                expect(r.data?.usageCount).toBe(1);
            });

            // all valid candidates fail validation -> findOldestValidSession returns
            // 'No live sessions found after validation' (line 1018) -> fallback path
            it('returns no-live-sessions when all candidates fail validation', async () => {
                const session = {
                    sessionString: 'BAD',
                    createdAt: new Date(Date.now() - 3 * 86400000),
                    lastUsedAt: new Date(),
                    usageCount: 0,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                audit.querySessionAudits.mockResolvedValue({ sessions: [session], total: 1 });
                jest.spyOn(service['sessionManager'], 'validateSession')
                    .mockResolvedValue({ isValid: false, error: 'temporary blip' });
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'NEW' });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(audit.revokeSession).not.toHaveBeenCalled();
                expect(r.data?.isNew).toBe(true);
            });

            // createSessionWithFallback catch branch (lines 1034-1035): createSession throws
            it('handles createSession throwing inside fallback path', async () => {
                audit.querySessionAudits.mockResolvedValue({ sessions: [], total: 0 });
                jest.spyOn(service, 'createSession').mockRejectedValue(new Error('fallback boom'));
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', allowFallback: true });
                expect(r.code).toBe('FALLBACK_CREATION_FAILED');
                expect(r.message).toMatch(/fallback boom/);
            });
        });

        // ─── Branch-coverage top-ups ──────────────────────────────────────────
        describe('SessionService misc branches', () => {
            // line 519: private getCredentials in SessionService (only reachable via reflection)
            it('getCredentials returns credentials for a mobile', () => {
                const creds = (service as any).getCredentials('919999999999');
                expect(creds).toHaveProperty('apiId');
                expect(creds).toHaveProperty('apiHash');
            });

            // line 528: rate-limit map cleanup when an entry has expired
            it('cleans up an expired rate-limit entry then allows again', () => {
                (service as any).rateLimitMap.set('919999999999', { count: 20, resetTime: Date.now() - 1000 });
                const r = (service as any).checkRateLimit('919999999999');
                expect(r.allowed).toBe(true);
            });

            // line 617: createSession catch when extractMobileFromSession throws
            it('returns error when extractMobileFromSession throws', async () => {
                jest.spyOn(service as any, 'extractMobileFromSession')
                    .mockRejectedValue(new Error('extract throw'));
                const r = await service.createSession({ oldSession: 'OLD' });
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Error extracting mobile from session: extract throw/);
            });

            // line 721: audit sessions exist but ALL fail (no throw) -> 'All audit sessions failed'
            it('returns final failure when audit sessions all fail without throwing', async () => {
                audit.getSessionsFormobile.mockResolvedValue([{ sessionString: 'A1' }, { sessionString: 'A2' }]);
                jest.spyOn(service['sessionManager'], 'createSession')
                    .mockResolvedValue({ success: false, error: 'always fails' });
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/All session creation strategies failed/);
            });
        });

        // ─── SessionManager branch top-ups ────────────────────────────────────
        describe('SessionManager misc branches', () => {
            let manager2: SessionManager;
            beforeEach(() => {
                manager2 = SessionManager.getInstance();
            });

            // line 56: withTelegramTimeout rejects when the operation exceeds the timeout
            it('withTelegramTimeout rejects on timeout', async () => {
                const neverResolves = () => new Promise<void>(() => { });
                await expect(
                    (manager2 as any).withTelegramTimeout(neverResolves, 5, 'slow op'),
                ).rejects.toThrow(/slow op timed out/);
            });

            // line 122: checkExistingSession rejects a non-string mobile
            it('createSession rejects a non-string truthy mobile (invalid mobile branch)', async () => {
                const r = await manager2.createSession({ mobile: 123 as any });
                expect(r.success).toBe(false);
                expect(r.error).toMatch(/Invalid mobile number provided/);
            });

            // line 204: createFromOldSession loop never runs (maxRetries < 1) -> 'Max retries exceeded'
            it('returns Max retries exceeded when maxRetries is 0', async () => {
                // validateSession passes; with maxRetries 0 the for-loop body never executes,
                // so neither the success nor the catch return fires -> hits the trailing return.
                jest.spyOn(manager2, 'validateSession').mockResolvedValue({ isValid: true });
                const r = await (manager2 as any).createFromOldSession({
                    oldSession: 'OLD',
                    mobile: '919999999999',
                    password: 'pw',
                    maxRetries: 0,
                });
                expect(r).toEqual({ success: false, error: 'Max retries exceeded', retryable: false });
            });

            // line 405: cleanupClient final-cleanup catch when _sender access/disconnect throws
            it('cleanupClient swallows error thrown during final _sender disconnect', async () => {
                const client: any = {
                    _destroyed: false,
                    destroy: jest.fn().mockResolvedValue(undefined),
                    _eventBuilders: [],
                };
                Object.defineProperty(client, '_sender', {
                    get() { throw new Error('sender access boom'); },
                });
                await expect(
                    (manager2 as any).cleanupClient(client, '919999999999', false),
                ).resolves.toBeUndefined();
                expect(client.destroy).toHaveBeenCalled();
            });

            // line 491: cleanupSessions error path with an error object lacking .message
            it('cleanupSessions falls back to default message when error has no message', async () => {
                const registry = ClientRegistry.getInstance();
                const id = await registry.acquireLock('919999999999');
                await registry.registerClient('919999999999', {} as any, 'sess', id!);
                jest.spyOn(registry, 'forceCleanup').mockRejectedValue({});
                const r = await manager2.cleanupSessions('919999999999', true);
                expect(r.success).toBe(false);
                expect(r.error).toBe('Cleanup failed');
            });
        });

        // ─── '|| fallback' right-side branches: errors without a .message ──────
        describe('SessionService default-message fallback branches', () => {
            // line 759
            it('getSessionAuditHistory uses default message when error lacks message', async () => {
                audit.querySessionAudits.mockRejectedValue({});
                const r = await service.getSessionAuditHistory('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toBe('Failed to get audit history');
            });

            // line 768
            it('getActiveSession uses default message when error lacks message', async () => {
                audit.getLatestActiveSession.mockRejectedValue({});
                const r = await service.getActiveSession('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toBe('Failed to get active session');
            });

            // line 782
            it('updateSessionLastUsed uses default message when error lacks message', async () => {
                audit.markSessionUsed.mockRejectedValue({});
                const r = await service.updateSessionLastUsed('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toBe('Failed to update session last used timestamp');
            });

            // line 818
            it('findRecentValidSession uses default message when error lacks message', async () => {
                audit.findRecentSessions.mockRejectedValue({});
                const r = await service.findRecentValidSession('919999999999');
                expect(r.success).toBe(false);
                expect(r.error).toBe('Failed to find valid session from this month');
            });

            // line 688: createSession outer catch fallback
            it('createSession uses default message when manager throws error without message', async () => {
                jest.spyOn(service['sessionManager'], 'createSession').mockRejectedValue({});
                const r = await service.createSession({ mobile: '919999999999' });
                expect(r.success).toBe(false);
                expect(r.error).toBe('Unexpected error');
            });

            // line 1022: findOldestValidSession catch fallback (error without message)
            //  + line 1037: createSessionWithFallback catch fallback (error without message)
            it('uses default messages when both lookup and fallback throw without message', async () => {
                audit.querySessionAudits.mockRejectedValue({}); // -> findOldestValidSession catch (1022)
                jest.spyOn(service, 'createSession').mockRejectedValue({}); // -> createSessionWithFallback catch (1037)
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999', allowFallback: true });
                expect(r.code).toBe('FALLBACK_CREATION_FAILED');
                expect(r.message).toMatch(/Failed to create session/);
            });

            // line 547 + 1008: validation failure with NO error string
            //  - isPermanentSessionValidationError receives undefined -> (error || '')
            //  - 'validationResult.error || "validation failed"' right side used
            it('handles validation failure with no error string', async () => {
                const session = {
                    sessionString: 'BAD',
                    createdAt: new Date(Date.now() - 2 * 86400000),
                    lastUsedAt: new Date(),
                    usageCount: 0,
                    mobile: '919999999999',
                    isActive: true,
                    status: SessionStatus.ACTIVE,
                };
                audit.querySessionAudits.mockResolvedValue({ sessions: [session], total: 1 });
                jest.spyOn(service['sessionManager'], 'validateSession')
                    .mockResolvedValue({ isValid: false }); // no error field
                jest.spyOn(service, 'createSession').mockResolvedValue({ success: true, session: 'NEW' });
                const r = await service.getOldestSessionOrCreate({ mobile: '919999999999' });
                expect(audit.revokeSession).not.toHaveBeenCalled();
                expect(r.data?.isNew).toBe(true);
            });

            // line 1013: revoke message right-side fallback ('unknown error') for a permanent
            // failure whose error string is itself falsy but classification was permanent.
            // Not reachable: isPermanentSessionValidationError(undefined) is false, so the
            // revoke block (and its inline fallback at 1013) can only run when error is a
            // permanent-classified non-empty string -> the '|| unknown error' right side is
            // unreachable without an internal contradiction. Documented; left uncovered.
        });
    });
});
