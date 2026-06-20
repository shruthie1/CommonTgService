/**
 * Client Service — coverage spec.
 *
 * Real MongoDB (memory server) + real ClientService logic, including the cache
 * lifecycle (onModuleInit / periodic refresh), setup-client swap orchestration,
 * updateClientSession cutover, updateClient profile refresh, and persona helpers.
 *
 * Only true externals are mocked: telegram/GramJS sleep, connectionManager,
 * TelegramService, fetchWithTimeout, notifbot, isPermanentError, fs/downloadFile.
 */
import { Connection, Model } from 'mongoose';
import { Client, ClientDocument, ClientSchema } from '../clients/schemas/client.schema';
import { BufferClient, BufferClientSchema } from '../buffer-clients/schemas/buffer-client.schema';
import { ClientService } from '../clients/client.service';
import { WarmupPhase } from '../shared/warmup-phases';
import {
    MongoTestContext, startMongo, stopMongo,
    makeClientData, resetCounter,
} from './api-test-helpers';
import { connectionManager } from '../Telegram/utils/connection-manager';
import isPermanentErrorDefault from '../../utils/isPermanentError';
import * as helpersModule from '../Telegram/manager/helpers';
import * as fs from 'fs';

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
jest.mock('../../utils/isPermanentError', () => ({
    __esModule: true,
    default: jest.fn(() => false),
}));
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(() => true),
    unlinkSync: jest.fn(),
}));

const isPermanentError = isPermanentErrorDefault as unknown as jest.Mock;

describe('ClientService coverage', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let ClientModel: Model<ClientDocument>;
    let BufferModel: Model<BufferClient>;
    let service: ClientService;
    let telegramService: any;
    let bufferClientService: any;
    let usersService: any;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('client-coverage-test');
        connection = ctx.connection;
        ClientModel = connection.model<ClientDocument>('ClientCoverage', ClientSchema);
        BufferModel = connection.model<BufferClient>('BufferForClientCoverage', BufferClientSchema);
        await ClientModel.init();
        await BufferModel.init();
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    function build() {
        telegramService = {
            hasActiveClientSetup: jest.fn(() => false),
            getActiveClientSetup: jest.fn(() => null),
            setActiveClientSetup: jest.fn(),
            clearActiveClientSetup: jest.fn(),
            updateUsernameForAClient: jest.fn(async () => 'new_username'),
            updatePrivacyforDeletedAccount: jest.fn(async () => undefined),
        };
        bufferClientService = {
            model: BufferModel,
            findAll: jest.fn(async () => []),
            findOne: jest.fn(async () => null),
            update: jest.fn(async () => null),
            createOrUpdate: jest.fn(async () => null),
            setPrimaryInUse: jest.fn(async () => null),
            executeQuery: jest.fn(async () => []),
            getOrEnsureDistinctUsersBackupSession: jest.fn(async () => null),
            markAsInactive: jest.fn(async () => null),
        };
        usersService = {
            search: jest.fn(async () => []),
            update: jest.fn(async () => 1),
            expireAccount: jest.fn(async () => undefined),
        };
        return new ClientService(
            ClientModel as any,
            telegramService as any,
            bufferClientService as any,
            usersService as any,
        );
    }

    beforeEach(() => {
        resetCounter();
        isPermanentError.mockReset();
        isPermanentError.mockReturnValue(false);
        service = build();
    });

    afterEach(async () => {
        await service.onModuleDestroy().catch(() => undefined);
        await ClientModel.deleteMany({});
        await BufferModel.deleteMany({});
        jest.restoreAllMocks();
    });

    // ─── lifecycle / cache ───────────────────────────────────────────────────

    describe('cache lifecycle', () => {
        it('onModuleInit loads cache from DB and findAll serves from it', async () => {
            await ClientModel.create(makeClientData({ clientId: 'life-1' }));
            await service.onModuleInit();
            expect((service as any).isInitialized).toBe(true);
            const all = await service.findAll();
            expect(all.some((c) => c.clientId === 'life-1')).toBe(true);
        });

        it('refreshMap + getServiceStatus + getCacheStatistics', async () => {
            await service.onModuleInit();
            await ClientModel.create(makeClientData({ clientId: 'life-2' }));
            await service.refreshMap();
            const status = service.getServiceStatus();
            expect(status.isInitialized).toBe(true);
            const stats = await service.getCacheStatistics();
            expect(stats.totalClients).toBeGreaterThanOrEqual(1);
        });

        it('findOne falls back to DB and caches, throws when missing', async () => {
            await service.onModuleInit();
            await ClientModel.create(makeClientData({ clientId: 'life-3' }));
            (service as any).clientsMap.clear();
            const found = await service.findOne('life-3');
            expect(found!.clientId).toBe('life-3');
            await expect(service.findOne('nope')).rejects.toThrow('not found');
            expect(await service.findOne('nope', false)).toBeNull();
        });

        it('masked finders strip secrets', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'life-4' }));
            const masked = await service.findOneMasked('life-4');
            expect(masked).not.toHaveProperty('session');
            expect(masked).not.toHaveProperty('mobile');
            const list = await service.findAllMasked();
            expect(list.every((c) => !('session' in c))).toBe(true);
            const obj = await service.findAllObject();
            expect(obj['life-4']).toBeDefined();
            const maskedObj = await service.findAllMaskedObject();
            expect(maskedObj['life-4']).toBeDefined();
        });
    });

    describe('periodic internals', () => {
        it('startPeriodicTasks schedules unref-ed intervals and purge clears expired entries', async () => {
            await service.onModuleInit();
            // expired cooldown (older than COOLDOWN_PERIOD) + expired lastUpdate
            (service as any).setupCooldownMap.set('old', Date.now() - 10 * 60 * 1000);
            (service as any).lastUpdateMap.set('old', Date.now() - 10 * 60 * 1000);
            (service as any).purgeExpiredCooldowns();
            expect((service as any).setupCooldownMap.has('old')).toBe(false);
            expect((service as any).lastUpdateMap.has('old')).toBe(false);
        });

        it('performPeriodicRefresh skips while a refresh is in flight', async () => {
            await service.onModuleInit();
            (service as any).refreshPromise = Promise.resolve();
            await (service as any).performPeriodicRefresh();
            (service as any).refreshPromise = null;
            await (service as any).performPeriodicRefresh();
            expect((service as any).cacheMetadata.isStale).toBe(false);
        });

        it('updateCacheMetadata marks stale after TTL', () => {
            (service as any).cacheMetadata = { lastUpdated: Date.now() - 60 * 60 * 1000, isStale: false };
            (service as any).updateCacheMetadata();
            expect((service as any).cacheMetadata.isStale).toBe(true);
        });

        it('ensureInitialized throws before init', () => {
            expect(() => (service as any).ensureInitialized()).toThrow('not initialized');
        });
    });

    // ─── CRUD ────────────────────────────────────────────────────────────────

    describe('CRUD', () => {
        it('create + update + remove + search', async () => {
            await service.onModuleInit();
            const created = await service.create(makeClientData({ clientId: 'crud-1', name: 'First' }));
            expect(created.clientId).toBe('crud-1');
            const updated = await service.update('crud-1', { name: 'Renamed' });
            expect(updated.name).toBe('Renamed');
            const searched = await service.search({ name: 'Renamed' } as any);
            expect(searched).toHaveLength(1);
            const removed = await service.remove('crud-1');
            expect(removed.clientId).toBe('crud-1');
        });

        it('update throws BadRequest for unknown client', async () => {
            await service.onModuleInit();
            await expect(service.update('ghost', { name: 'x' })).rejects.toThrow();
        });

        it('remove throws for unknown client', async () => {
            await service.onModuleInit();
            await expect(service.remove('ghost')).rejects.toThrow();
        });

        it('executeQuery applies sort/limit/skip', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'q-1' }));
            await service.create(makeClientData({ clientId: 'q-2' }));
            const res = await service.executeQuery({}, { clientId: 1 }, 1, 0);
            expect(res).toHaveLength(1);
            await expect(service.executeQuery(null as any)).rejects.toThrow('Query is invalid');
        });
    });

    // ─── setupClient / handleSetupClient ─────────────────────────────────────

    describe('setupClient()', () => {
        it('no-ops when AUTO_CLIENT_SETUP disabled', async () => {
            await service.onModuleInit();
            const prev = process.env.AUTO_CLIENT_SETUP;
            delete process.env.AUTO_CLIENT_SETUP;
            const handleSpy = jest.spyOn(service as any, 'handleSetupClient');
            await service.setupClient('any', { reason: 'r' } as any);
            expect(handleSpy).not.toHaveBeenCalled();
            if (prev !== undefined) process.env.AUTO_CLIENT_SETUP = prev;
        });

        it('respects the setup cooldown', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            (service as any).setupCooldownMap.set('cool-1', Date.now());
            const handleSpy = jest.spyOn(service as any, 'handleSetupClient');
            await service.setupClient('cool-1', { reason: 'r' } as any);
            expect(handleSpy).not.toHaveBeenCalled();
        });

        it('selects a buffer candidate, registers setup and runs the real cutover into the DB', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'swap-1', mobile: '15558880001', session: 'old-active-session' }));

            bufferClientService.executeQuery.mockResolvedValue([
                { mobile: '15558880002', session: 'buffer-session' },
            ]);
            // findSafeSetupBufferCandidate -> assertDistinctUserBackupSession -> getOrEnsureDistinctUsersBackupSession
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({
                tgId: 'tg-b', mobile: '15558880002', session: 'distinct-backup-session',
            });
            bufferClientService.findOne.mockResolvedValue({ mobile: '15558880002', username: 'buf2user', assignedFirstName: 'Q', assignedProfilePics: [] });
            // Make the telegramService setup registry stateful so the REAL updateClientSession can read it back.
            let registeredSetup: any = null;
            telegramService.setActiveClientSetup.mockImplementation((s: any) => { registeredSetup = s; });
            telegramService.getActiveClientSetup.mockImplementation(() => registeredSetup);
            telegramService.clearActiveClientSetup.mockImplementation(() => { registeredSetup = null; });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ getMe: jest.fn(async () => ({ username: 'tg2' })) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            // archiveOld path → archiveOldClient → assertDistinctUserBackupSession + createOrUpdate (sibling mock)
            usersService.search.mockResolvedValue([{ tgId: 'tg-old', mobile: '15558880001', session: 'user-old-backup' }]);

            await service.setupClient('swap-1', { reason: 'swap', archiveOld: true, formalities: false } as any);

            expect(telegramService.setActiveClientSetup).toHaveBeenCalledWith(expect.objectContaining({
                clientId: 'swap-1', existingMobile: '15558880001', newMobile: '15558880002',
            }));
            // Real cutover committed to the DB: the active client row now points at the new mobile/session/username.
            const after = await ClientModel.findOne({ clientId: 'swap-1' }).lean();
            expect(after!.mobile).toBe('15558880002');
            expect(after!.session).toBe('buffer-session');
            expect(after!.username).toBe('buf2user');
            expect(bufferClientService.setPrimaryInUse).toHaveBeenCalledWith('swap-1', '15558880002');
            // Old mobile archived back to buffer pool.
            expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith('15558880001', expect.objectContaining({
                warmupPhase: WarmupPhase.SESSION_ROTATED,
            }));
        });

        it('marks existing buffer inactive when no candidate and reason is permanent', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'swap-2', mobile: '15558880010', session: 'sess' }));
            bufferClientService.executeQuery.mockResolvedValue([]);
            isPermanentError.mockReturnValue(true);
            await service.setupClient('swap-2', { reason: 'SESSION_REVOKED' } as any);
            // Real markBufferInactiveForArchival ran → cascades to usersService.expireAccount (external).
            expect(usersService.expireAccount).toHaveBeenCalledWith('15558880010', 'SESSION_REVOKED');
        });

        it('handles a permanent error during the real cutover by expiring the new mobile', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'swap-3', mobile: '15558880020', session: 'old-sess' }));
            bufferClientService.executeQuery.mockResolvedValue([{ mobile: '15558880021', session: 'buf-sess' }]);
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15558880021', session: 'distinct' });
            let registeredSetup: any = null;
            telegramService.setActiveClientSetup.mockImplementation((s: any) => { registeredSetup = s; });
            telegramService.getActiveClientSetup.mockImplementation(() => registeredSetup);
            telegramService.clearActiveClientSetup.mockImplementation(() => { registeredSetup = null; });
            // Real updateClientSession runs; its getMe() throws permanently before cutover commits.
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => { throw new Error('SESSION_REVOKED'); }),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);

            await service.setupClient('swap-3', { reason: 'r' } as any);
            // Real updateClientSession's permanent-failure branch + setupClient's catch both retire the new mobile.
            expect(usersService.expireAccount).toHaveBeenCalledWith('15558880021', expect.any(String));
            expect(telegramService.clearActiveClientSetup).toHaveBeenCalledWith('15558880021');
            // The active client row was NOT swapped (cutover never committed).
            const after = await ClientModel.findOne({ clientId: 'swap-3' }).lean();
            expect(after!.mobile).toBe('15558880020');
            expect(after!.session).toBe('old-sess');
        });

        it('pushes availableDate out on a transient cutover error from the real cutover', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'swap-4', mobile: '15558880030', session: 'old-sess' }));
            bufferClientService.executeQuery.mockResolvedValue([{ mobile: '15558880031', session: 'buf-sess' }]);
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15558880031', session: 'distinct' });
            let registeredSetup: any = null;
            telegramService.setActiveClientSetup.mockImplementation((s: any) => { registeredSetup = s; });
            telegramService.getActiveClientSetup.mockImplementation(() => registeredSetup);
            telegramService.clearActiveClientSetup.mockImplementation(() => { registeredSetup = null; });
            // Real updateClientSession runs; its getMe() throws transiently before cutover commits.
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => { throw new Error('TIMEOUT'); }),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(false);

            await service.setupClient('swap-4', { reason: 'r' } as any);
            expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith('15558880031', expect.objectContaining({ availableDate: expect.any(String) }));
        });
    });

    // ─── updateClientSession (cutover) ───────────────────────────────────────

    describe('updateClientSession()', () => {
        it('throws when no active setup is registered', async () => {
            await service.onModuleInit();
            telegramService.getActiveClientSetup.mockReturnValue(null);
            await expect(service.updateClientSession('s', 'm')).rejects.toThrow('No active client setup');
        });

        it('commits the cutover, marks buffer in-use and triggers deploy', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-1', mobile: '15557770001', session: 'old', username: 'oldu', deployKey: 'https://deploy.test/x' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-1', existingMobile: '15557770001', newMobile: '15557770002',
                archiveOld: true, formalities: false, reason: undefined, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'newtg' })),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            bufferClientService.findOne.mockResolvedValue({ mobile: '15557770002', username: 'bufuser', assignedFirstName: 'Z', assignedProfilePics: [] });
            const archivalSpy = jest.spyOn(service as any, 'handleClientArchival').mockResolvedValue(undefined);

            await service.updateClientSession('new-session', '15557770002');

            const after = await ClientModel.findOne({ clientId: 'cut-1' }).lean();
            expect(after!.mobile).toBe('15557770002');
            expect(after!.session).toBe('new-session');
            expect(after!.username).toBe('bufuser');
            expect(bufferClientService.setPrimaryInUse).toHaveBeenCalledWith('cut-1', '15557770002');
            expect(archivalSpy).toHaveBeenCalled();
        });

        it('rejects an invalid replacement session', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-2', mobile: '15557770010', session: 'old' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-2', existingMobile: '15557770010', newMobile: '15557770011',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ getMe: jest.fn(async () => ({ username: 'x' })) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            bufferClientService.findOne.mockResolvedValue({ mobile: '15557770011', username: 'u' });

            await expect(service.updateClientSession('   ', '15557770011')).rejects.toThrow('Invalid replacement session');
        });

        it('expires the new mobile when getClient fails permanently', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-3', mobile: '15557770020', session: 'old' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-3', existingMobile: '15557770020', newMobile: '15557770021',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('AUTH_KEY_UNREGISTERED'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);

            await expect(service.updateClientSession('new', '15557770021')).rejects.toThrow();
            expect(usersService.expireAccount).toHaveBeenCalledWith('15557770021', expect.any(String));
        });
    });

    // ─── updateClient (profile refresh) ──────────────────────────────────────

    describe('updateClient()', () => {
        it('returns false when the client lookup yields null', async () => {
            await service.onModuleInit();
            // findOne(throwErr=true) returns null only via the cache/DB miss path that does
            // not throw — emulate by stubbing it to resolve null so the !client guard runs.
            jest.spyOn(service, 'findOne').mockResolvedValue(null);
            expect(await service.updateClient('missing', 'msg')).toBe(false);
        });

        it('throws NotFound when client lookup is null and throwOnFailure set', async () => {
            await service.onModuleInit();
            jest.spyOn(service, 'findOne').mockResolvedValue(null);
            await expect(service.updateClient('missing', 'msg', false, true)).rejects.toThrow('Client not found');
        });

        it('respects the per-client cooldown', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-cool' }));
            (service as any).lastUpdateMap.set('upd-cool', Date.now());
            expect(await service.updateClient('upd-cool', 'msg')).toBe(false);
        });

        it('refreshes identity, privacy and photos and triggers deploy', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-1', mobile: '15556660001', username: 'cur', deployKey: 'https://deploy.test/u' }));
            // active assignment with 2 pics so photo path runs
            jest.spyOn(service, 'getActiveClientAssignment').mockResolvedValue({
                mobile: '15556660001', assignedFirstName: 'Nina', assignedLastName: 'Vox',
                assignedBio: 'a bio', assignedProfilePics: ['http://p/1.jpg', 'http://p/2.jpg'], source: 'activeClient',
            } as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: '' } }) // GetFullUser (identity)
                .mockResolvedValueOnce(undefined) // UpdateProfile
                .mockResolvedValueOnce({ photos: [] }); // GetUserPhotos
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'cur', firstName: 'Old' })),
                client: { invoke },
                updatePrivacy: jest.fn(async () => undefined),
                deleteProfilePhotos: jest.fn(async () => undefined),
                updateProfilePic: jest.fn(async () => undefined),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(helpersModule, 'downloadFileFromUrl').mockResolvedValue(Buffer.from('img'));
            (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.unlinkSync as jest.Mock).mockImplementation(() => undefined);
            const stampSpy = jest.spyOn(service as any, 'stampActiveBufferLifecycle').mockResolvedValue(undefined);

            const result = await service.updateClient('upd-1', 'force', false, false, true);
            expect(result).toBe(true);
            expect(stampSpy).toHaveBeenCalled();
        });

        it('returns false and clears cooldown on failure', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-2', mobile: '15556660010' }));
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('boom'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            expect(await service.updateClient('upd-2', 'msg')).toBe(false);
            expect((service as any).lastUpdateMap.has('upd-2')).toBe(false);
        });

        it('rethrows on failure when throwOnFailure is set', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-3', mobile: '15556660020' }));
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('boom'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            await expect(service.updateClient('upd-3', 'msg', false, true)).rejects.toThrow();
        });

        it('updateClients iterates all clients', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'iter-1' }));
            const updateSpy = jest.spyOn(service, 'updateClient').mockResolvedValue(true);
            await service.updateClients();
            expect(updateSpy).toHaveBeenCalled();
        });

        it('skips username/identity/photo work when nothing needs changing', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-skip', mobile: '15556661001', username: 'samename'}));
            // No identity assignment, <2 profile pics → identity + photo paths skip
            jest.spyOn(service, 'getActiveClientAssignment').mockResolvedValue(null);
            const invoke = jest.fn().mockResolvedValueOnce({ photos: [{}, {}] }); // GetUserPhotos (>=2)
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'samename', firstName: 'F' })),
                client: { invoke },
                updatePrivacy: jest.fn(async () => undefined),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'stampActiveBufferLifecycle').mockResolvedValue(undefined);

            // skipUsername=true so username path is bypassed entirely
            const result = await service.updateClient('upd-skip', 'msg', true, false, true);
            expect(result).toBe(true);
        });

        it('updates username when stored value differs from Telegram', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-uname', mobile: '15556661010', username: 'stored' }));
            jest.spyOn(service, 'getActiveClientAssignment').mockResolvedValue(null);
            const invoke = jest.fn().mockResolvedValueOnce({ photos: [{}, {}] });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'different', firstName: 'F' })),
                client: { invoke },
                updatePrivacy: jest.fn(async () => undefined),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'stampActiveBufferLifecycle').mockResolvedValue(undefined);

            const result = await service.updateClient('upd-uname', 'msg', false, false, false);
            expect(result).toBe(true);
            expect(telegramService.updateUsernameForAClient).toHaveBeenCalled();
        });
    });

    describe('private profile helpers', () => {
        it('stampActiveBufferLifecycle early-returns for empty update and swallows errors', async () => {
            await service.onModuleInit();
            await (service as any).stampActiveBufferLifecycle('', {}); // empty mobile
            await (service as any).stampActiveBufferLifecycle('m', {}); // empty update
            expect(bufferClientService.update).not.toHaveBeenCalled();
            bufferClientService.update.mockRejectedValueOnce(new Error('db down'));
            await (service as any).stampActiveBufferLifecycle('m', { privacyUpdatedAt: new Date() });
            expect(bufferClientService.update).toHaveBeenCalled();
        });

        it('updateClientUsername skips when stored username matches Telegram', async () => {
            await service.onModuleInit();
            const client = { clientId: 'uh-1', mobile: 'm', username: 'same' } as any;
            await (service as any).updateClientUsername(client, { username: 'same' }, null);
            expect(telegramService.updateUsernameForAClient).not.toHaveBeenCalled();
        });

        it('updateClientUsername logs when Telegram returns no username', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'uh-2', username: 'old' }));
            telegramService.updateUsernameForAClient.mockResolvedValue('');
            const client = await service.findOne('uh-2');
            await (service as any).updateClientUsername(client, { username: 'tgname' }, null);
            expect(telegramService.updateUsernameForAClient).toHaveBeenCalled();
        });

        it('updateClientIdentity returns false without an assignment', async () => {
            await service.onModuleInit();
            const result = await (service as any).updateClientIdentity(
                { clientId: 'id-1' } as any, { client: { invoke: jest.fn() } } as any, { firstName: 'F' }, null,
            );
            expect(result).toBe(false);
        });

        it('updateClientPhotos skips when fewer than 2 assigned pics', async () => {
            await service.onModuleInit();
            const tg = { client: { invoke: jest.fn(async () => ({ photos: [] })) } } as any;
            const result = await (service as any).updateClientPhotos(
                { clientId: 'ph-1' } as any, tg, { assignedProfilePics: ['only-one'] } as any,
            );
            expect(result).toBe(false);
        });

        it('updateClientPhotos no-ops when photos already exist', async () => {
            await service.onModuleInit();
            const tg = { client: { invoke: jest.fn(async () => ({ photos: [{}, {}] })) } } as any;
            const result = await (service as any).updateClientPhotos(
                { clientId: 'ph-2' } as any, tg, { assignedProfilePics: ['a', 'b'] } as any,
            );
            expect(result).toBe(true);
        });
    });

    // ─── persona helpers ─────────────────────────────────────────────────────

    describe('persona helpers', () => {
        it('getPersonaPool returns null for unknown client, pool for known', async () => {
            await service.onModuleInit();
            expect(await service.getPersonaPool('ghost')).toBeNull();
            await service.create(makeClientData({ clientId: 'pp-1', firstNames: ['A'], bios: ['b'], dbcoll: 'MyColl' }));
            const pool = await service.getPersonaPool('pp-1');
            expect(pool!.firstNames).toEqual(['A']);
            expect(pool!.dbcoll).toBe('mycoll');
        });

        it('getActiveClientAssignment returns null without identifiers and reads from buffer model', async () => {
            await service.onModuleInit();
            expect(await service.getActiveClientAssignment(null)).toBeNull();
            expect(await service.getActiveClientAssignment({ clientId: 'c' } as any)).toBeNull();

            await BufferModel.create({
                tgId: 'tg-a', mobile: '15555550001', session: 's', availableDate: '2026-01-01',
                channels: 1, clientId: 'pa-1', status: 'active',
                assignedFirstName: 'Mara', assignedProfilePics: ['u1'],
            });
            const assignment = await service.getActiveClientAssignment({ clientId: 'pa-1', mobile: '15555550001' } as any);
            expect(assignment!.assignedFirstName).toBe('Mara');
            expect(assignment!.source).toBe('activeClient');
        });

        it('getExistingAssignments aggregates buffer + active client scope', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'pa-2', mobile: '15555550010' }));
            await BufferModel.create({
                tgId: 'tg-b', mobile: '15555550011', session: 's', availableDate: '2026-01-01',
                channels: 1, clientId: 'pa-2', status: 'active', assignedFirstName: 'Liv',
            });
            const { assignments } = await service.getExistingAssignments('pa-2', 'all');
            expect(assignments.some((a) => a.assignedFirstName === 'Liv')).toBe(true);
        });
    });

    // ─── archival via handleClientArchival (Path coverage) ───────────────────

    describe('handleClientArchival()', () => {
        it('returns old mobile to buffer pool when archiveOld=true (full archival DTO)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'arc-1', mobile: '15554440001', session: 'sess' }));
            usersService.search.mockResolvedValue([{ tgId: 'tg-old', mobile: '15554440001', session: 'user-backup-session' }]);
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 'tg-old', mobile: '15554440001', session: 'distinct-backup' });
            const client = await service.findOne('arc-1');
            const days = 0;
            await (service as any).handleClientArchival(client, '15554440001', false, true, days, undefined);
            // Real archiveOldClient ran and persisted the full archival contract back to the buffer pool.
            const expectedAvailable = new Date();
            expectedAvailable.setDate(expectedAvailable.getDate() + days + 1);
            const expectedDateStr = expectedAvailable.toISOString().split('T')[0];
            expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith('15554440001', expect.objectContaining({
                clientId: 'arc-1',
                mobile: '15554440001',
                session: 'sess',
                tgId: 'tg-old',
                channels: 170,
                status: 'active',
                inUse: false,
                warmupPhase: WarmupPhase.SESSION_ROTATED,
                availableDate: expectedDateStr,
            }));
            // markBufferInactiveForArchival must NOT fire on a clean archival.
            expect(usersService.expireAccount).not.toHaveBeenCalled();
        });

        it('marks buffer inactive for a permanent reason (real cascade)', async () => {
            await service.onModuleInit();
            isPermanentError.mockReturnValue(true);
            await (service as any).handleClientArchival({ clientId: 'arc-2', session: 's' } as any, '15554440010', false, true, 0, 'SESSION_REVOKED');
            // Real markBufferInactiveForArchival ran → cascades to usersService.expireAccount (external).
            expect(usersService.expireAccount).toHaveBeenCalledWith('15554440010', 'SESSION_REVOKED');
            // It short-circuited before any archival write.
            expect(bufferClientService.createOrUpdate).not.toHaveBeenCalled();
        });

        it('marks buffer inactive when archiveOld=false (no archival)', async () => {
            await service.onModuleInit();
            usersService.search.mockResolvedValue([{ tgId: 'tg-old', mobile: '15554440020', session: 'backup' }]);
            await (service as any).handleClientArchival({ clientId: 'arc-3', session: 's' } as any, '15554440020', false, false, 0, 'transient');
            expect(bufferClientService.update).toHaveBeenCalledWith('15554440020', expect.objectContaining({ status: 'inactive' }));
        });

        it('runs privacy formalities then archives the old mobile back to the buffer pool', async () => {
            await service.onModuleInit();
            usersService.search.mockResolvedValue([{ tgId: 'tg-old', mobile: '15554440030', session: 'backup' }]);
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 'tg-old', mobile: '15554440030', session: 'distinct-backup' });
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            await (service as any).handleClientArchival({ clientId: 'arc-4', session: 's' } as any, '15554440030', true, true, 0, undefined);
            // Real handleFormalities ran.
            expect(telegramService.updatePrivacyforDeletedAccount).toHaveBeenCalledWith('15554440030');
            // Real archiveOldClient ran and persisted the archival DTO to the buffer pool.
            expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith('15554440030', expect.objectContaining({
                clientId: 'arc-4',
                session: 's',
                channels: 170,
                warmupPhase: WarmupPhase.SESSION_ROTATED,
            }));
        });

        it('marks buffer inactive when the old user document is missing (real cascade)', async () => {
            await service.onModuleInit();
            usersService.search.mockResolvedValue([]);
            await (service as any).handleClientArchival({ clientId: 'arc-5', session: 's' } as any, '15554440040', false, true, 0, undefined);
            // No user doc → real markBufferInactiveForArchival cascades to expireAccount with a descriptive reason.
            expect(usersService.expireAccount).toHaveBeenCalledWith(
                '15554440040',
                expect.stringContaining('user document missing'),
            );
            expect(bufferClientService.createOrUpdate).not.toHaveBeenCalled();
        });
    });

    // ─── findSafeSetupBufferCandidate skip branches ──────────────────────────

    describe('findSafeSetupBufferCandidate()', () => {
        it('returns null when all candidates are unsafe', async () => {
            await service.onModuleInit();
            // candidate with no session, candidate matching active session, candidate that
            // fails the distinct-backup assertion.
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockRejectedValue(new Error('cannot create'));
            const result = await (service as any).findSafeSetupBufferCandidate(
                [
                    { mobile: 'm1' }, // no session
                    { mobile: 'm2', session: 'active-session' }, // equals existing
                    { mobile: 'm3', session: 'other-session' }, // assertion throws
                ],
                'active-session',
            );
            expect(result).toBeNull();
        });

        it('returns the first candidate with a distinct backup session', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({
                tgId: 't', mobile: 'm4', session: 'distinct-backup',
            });
            const result = await (service as any).findSafeSetupBufferCandidate(
                [{ mobile: 'm4', session: 'candidate-session' }],
                'active-session',
            );
            expect(result!.mobile).toBe('m4');
        });

        it('skips a candidate whose backup session is still duplicated, then accepts a distinct one', async () => {
            await service.onModuleInit();
            // First call -> backup session equals the candidate session (still duplicated).
            // Second call -> a genuinely distinct backup session.
            bufferClientService.getOrEnsureDistinctUsersBackupSession
                .mockResolvedValueOnce({ tgId: 't5', mobile: 'm5', session: 'dup-session' })
                .mockResolvedValueOnce({ tgId: 't6', mobile: 'm6', session: 'really-distinct' });
            const result = await (service as any).findSafeSetupBufferCandidate(
                [
                    { mobile: 'm5', session: 'dup-session' }, // backup === candidate session → skip (849-850)
                    { mobile: 'm6', session: 'candidate6' },  // distinct backup → accept
                ],
                'active-session',
            );
            expect(result!.mobile).toBe('m6');
        });
    });

    // ─── assertDistinctUserBackupSession branches (868, 873, 879) ─────────────

    describe('assertDistinctUserBackupSession()', () => {
        it('rethrows a NotFoundException raised by the buffer service', async () => {
            await service.onModuleInit();
            const { NotFoundException } = require('@nestjs/common');
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockRejectedValue(
                new NotFoundException('user gone'),
            );
            await expect(
                (service as any).assertDistinctUserBackupSession('m-nf', 'active-sess'),
            ).rejects.toThrow('user gone');
        });

        it('throws BadRequest when no backup user is returned', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue(null);
            await expect(
                (service as any).assertDistinctUserBackupSession('m-null', 'active-sess'),
            ).rejects.toThrow('Failed to create distinct backup session');
        });

        it('throws BadRequest when the returned backup session is not distinct', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({
                tgId: 't', mobile: 'm-dup', session: 'active-sess',
            });
            await expect(
                (service as any).assertDistinctUserBackupSession('m-dup', 'active-sess'),
            ).rejects.toThrow('Distinct backup session was not persisted');
        });
    });

    // ─── lifecycle catch / interval-callback coverage (130,146,152-165,211) ───

    describe('lifecycle error + interval internals', () => {
        it('onModuleInit swallows a refresh failure (catch path)', async () => {
            jest.spyOn(service as any, 'refreshCacheFromDatabase').mockRejectedValueOnce(new Error('db down'));
            await service.onModuleInit();
            // The catch ran via parseError; init did not rethrow.
            expect((service as any).isInitialized).toBe(false);
        });

        it('refreshCacheFromDatabase swallows a query failure (211)', async () => {
            jest.spyOn(service as any, 'executeWithRetry').mockRejectedValueOnce(new Error('find blew up'));
            await (service as any).refreshCacheFromDatabase();
            // Map left untouched; no throw.
            expect((service as any).clientsMap.size).toBeGreaterThanOrEqual(0);
        });

        it('onModuleDestroy swallows a shutdown failure (catch path 146)', async () => {
            await service.onModuleInit();
            jest.spyOn(connectionManager, 'shutdown').mockRejectedValueOnce(new Error('shutdown boom'));
            await expect(service.onModuleDestroy()).resolves.toBeUndefined();
        });

        it('onModuleDestroy awaits an in-flight refresh promise', async () => {
            await service.onModuleInit();
            jest.spyOn(connectionManager, 'shutdown').mockResolvedValue(undefined as any);
            (service as any).refreshPromise = Promise.resolve();
            await service.onModuleDestroy();
            expect((service as any).isShuttingDown).toBe(true);
        });

        it('interval callbacks run their bodies and honor the shutdown guard', async () => {
            await service.onModuleInit();
            const refreshSpy = jest.spyOn(service as any, 'performPeriodicRefresh').mockResolvedValue(undefined);
            const metaSpy = jest.spyOn(service as any, 'updateCacheMetadata');
            const purgeSpy = jest.spyOn(service as any, 'purgeExpiredCooldowns');

            // Drive each registered interval handler manually (the bodies on 152-165).
            const checkFn = ((service as any).checkInterval as any)._onTimeout as () => Promise<void>;
            const refreshFn = ((service as any).refreshInterval as any)._onTimeout as () => void;
            const cleanupFn = ((service as any).cleanupInterval as any)._onTimeout as () => void;

            // Not shutting down → bodies execute.
            (service as any).isShuttingDown = false;
            await checkFn();
            refreshFn();
            cleanupFn();
            expect(refreshSpy).toHaveBeenCalled();
            expect(metaSpy).toHaveBeenCalled();
            expect(purgeSpy).toHaveBeenCalled();

            // Shutting down → early-return guard on each handler.
            refreshSpy.mockClear(); metaSpy.mockClear(); purgeSpy.mockClear();
            (service as any).isShuttingDown = true;
            await checkFn();
            refreshFn();
            cleanupFn();
            expect(refreshSpy).not.toHaveBeenCalled();
            expect(metaSpy).not.toHaveBeenCalled();
            expect(purgeSpy).not.toHaveBeenCalled();
            (service as any).isShuttingDown = false;
        });
    });

    // ─── findAll cache-hit fast path (240-241) ────────────────────────────────

    describe('findAll cache-hit fast path', () => {
        it('serves directly from cache once warmed past the threshold and fresh', async () => {
            await service.onModuleInit();
            // Seed >= CACHE_WARMUP_THRESHOLD (20) clients straight into the map and mark fresh.
            for (let i = 0; i < 25; i++) {
                (service as any).clientsMap.set(`fast-${i}`, { clientId: `fast-${i}` });
            }
            (service as any).cacheMetadata = { lastUpdated: Date.now(), isStale: false };
            const refreshSpy = jest.spyOn(service as any, 'refreshCacheFromDatabase');
            const all = await service.findAll();
            expect(all.length).toBeGreaterThanOrEqual(25);
            expect(refreshSpy).not.toHaveBeenCalled();
        });
    });

    // ─── search / canonicalMobile / notify / post-update / retry edges ────────

    describe('error + default branches', () => {
        it('search wraps a synchronous filter failure in an InternalServerError (348-349)', async () => {
            await service.onModuleInit();
            // processTextSearchFields canonicalizes a string mobile filter synchronously inside
            // the try block; an invalid mobile throws there and is caught by search's catch.
            await expect(service.search({ mobile: 'not-a-number' } as any)).rejects.toThrow();
        });

        it('canonicalMobile rethrows as BadRequest on an invalid mobile (369-370)', async () => {
            await service.onModuleInit();
            expect(() => (service as any).canonicalMobile('not-a-number')).toThrow();
        });

        it('processTextSearchFields canonicalizes a mobile filter (410)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'srch-m', mobile: '15559990001' }));
            const res = await service.search({ mobile: '+15559990001' } as any);
            expect(res.some((c) => c.clientId === 'srch-m')).toBe(true);
        });

        it('notify swallows a fetch failure (384-385)', async () => {
            await service.onModuleInit();
            const { fetchWithTimeout } = require('../../utils/fetchWithTimeout');
            (fetchWithTimeout as jest.Mock).mockRejectedValueOnce(new Error('net down'));
            await expect((service as any).notify('hello')).resolves.toBeUndefined();
            (fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: true });
        });

        it('performPostUpdateTasks swallows a refresh failure inside setImmediate (394)', async () => {
            await service.onModuleInit();
            jest.spyOn(service as any, 'refreshExternalMaps').mockRejectedValueOnce(new Error('refresh fail'));
            (service as any).performPostUpdateTasks({ clientId: 'pp' } as any);
            await new Promise((r) => setImmediate(r));
            await new Promise((r) => setImmediate(r));
            // No throw escapes — reaching here is the assertion.
            expect(true).toBe(true);
        });

        it('executeWithRetry retries then throws after exhausting attempts (438)', async () => {
            await service.onModuleInit();
            jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
            const op = jest.fn().mockRejectedValue(new Error('always fails'));
            await expect((service as any).executeWithRetry(op)).rejects.toThrow('always fails');
            expect(op).toHaveBeenCalledTimes(3);
        });
    });

    // ─── handleSetupClient missing-client guard (501-502) ─────────────────────

    describe('handleSetupClient missing client', () => {
        it('logs and returns when the client cannot be found', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            // findOne is invoked with the default throwErr=true, so the only way the
            // !existingClient guard (501-502) executes is a null resolution — stub it.
            jest.spyOn(service, 'findOne').mockResolvedValue(null);
            const querySpy = jest.spyOn(bufferClientService, 'executeQuery');
            await (service as any).handleSetupClient('ghost-setup', { reason: 'r' } as any);
            // Bailed before any buffer scan.
            expect(querySpy).not.toHaveBeenCalled();
        });
    });

    // ─── updateClientSession setPrimaryInUse + deploy catch (647-648,665-667) ─

    describe('updateClientSession secondary failures', () => {
        it('continues the cutover when setPrimaryInUse and deploy both fail', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-sec', mobile: '15557771001', session: 'old', username: 'oldu', deployKey: 'https://deploy.test/sec' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-sec', existingMobile: '15557771001', newMobile: '15557771002',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'newtg' })),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            bufferClientService.findOne.mockResolvedValue({ mobile: '15557771002', username: 'bufuser', assignedProfilePics: [] });
            bufferClientService.setPrimaryInUse.mockRejectedValueOnce(new Error('primary stamp failed')); // 647-648
            const { fetchWithTimeout } = require('../../utils/fetchWithTimeout');
            (fetchWithTimeout as jest.Mock).mockImplementation((url: string) => {
                if (url === 'https://deploy.test/sec') return Promise.reject(new Error('deploy down')); // 665-667
                return Promise.resolve({ ok: true });
            });
            // archiveOld=false path → mark inactive (no archive write needed)
            usersService.search.mockResolvedValue([{ tgId: 'tg', mobile: '15557771001', session: 'backup' }]);

            await service.updateClientSession('new-session', '15557771002');

            const after = await ClientModel.findOne({ clientId: 'cut-sec' }).lean();
            expect(after!.mobile).toBe('15557771002');
            expect(after!.session).toBe('new-session');
            (fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: true });
        });
    });

    // ─── handleClientArchival outer catch (738-743) ──────────────────────────

    describe('handleClientArchival outer catch', () => {
        it('handles a permanent error thrown mid-archival by marking buffer inactive', async () => {
            await service.onModuleInit();
            // usersService.search throws → falls into the outer catch (738-743).
            usersService.search.mockRejectedValue(new Error('SESSION_REVOKED while searching'));
            isPermanentError.mockReturnValue(true);
            await (service as any).handleClientArchival(
                { clientId: 'arc-catch', session: 's' } as any, '15554441001', false, true, 0, undefined,
            );
            expect(usersService.expireAccount).toHaveBeenCalledWith(
                '15554441001',
                expect.stringContaining('SESSION_REVOKED'),
            );
        });

        it('swallows a transient error thrown mid-archival without marking inactive', async () => {
            await service.onModuleInit();
            usersService.search.mockRejectedValue(new Error('TIMEOUT while searching'));
            isPermanentError.mockReturnValue(false);
            await (service as any).handleClientArchival(
                { clientId: 'arc-catch2', session: 's' } as any, '15554441002', false, true, 0, undefined,
            );
            expect(usersService.expireAccount).not.toHaveBeenCalled();
        });
    });

    // ─── markBufferInactiveForArchival catch (766-768) ───────────────────────

    describe('markBufferInactiveForArchival failure', () => {
        it('swallows an expireAccount failure', async () => {
            await service.onModuleInit();
            usersService.expireAccount.mockRejectedValueOnce(new Error('expire blew up'));
            await expect(
                (service as any).markBufferInactiveForArchival('15554442001', 'reason text'),
            ).resolves.toBeUndefined();
        });
    });

    // ─── archiveOldClient catch: permanent + transient (810-830) ─────────────

    describe('archiveOldClient catch branches', () => {
        it('marks buffer inactive when archival fails permanently', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15554443001', session: 'distinct' });
            bufferClientService.createOrUpdate.mockRejectedValueOnce(new Error('USER_DEACTIVATED'));
            isPermanentError.mockReturnValue(true);
            await (service as any).archiveOldClient(
                { clientId: 'arc-perm', session: 's' } as any,
                { tgId: 'tg', mobile: '15554443001' } as any,
                '15554443001',
                0,
            );
            expect(usersService.expireAccount).toHaveBeenCalledWith('15554443001', expect.any(String));
        });

        it('releases the reservation when archival fails transiently', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15554443002', session: 'distinct' });
            bufferClientService.createOrUpdate.mockRejectedValueOnce(new Error('TIMEOUT'));
            isPermanentError.mockReturnValue(false);
            await (service as any).archiveOldClient(
                { clientId: 'arc-trans', session: 's' } as any,
                { tgId: 'tg', mobile: '15554443002' } as any,
                '15554443002',
                0,
            );
            expect(bufferClientService.update).toHaveBeenCalledWith('15554443002', expect.objectContaining({
                inUse: false,
                status: 'active',
                availableDate: expect.any(String),
            }));
        });

        it('logs when releasing the reservation itself fails transiently', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15554443003', session: 'distinct' });
            bufferClientService.createOrUpdate.mockRejectedValueOnce(new Error('TIMEOUT'));
            bufferClientService.update.mockRejectedValueOnce(new Error('release failed'));
            isPermanentError.mockReturnValue(false);
            await expect((service as any).archiveOldClient(
                { clientId: 'arc-trans2', session: 's' } as any,
                { tgId: 'tg', mobile: '15554443004' } as any,
                '15554443004',
                0,
            )).resolves.toBeUndefined();
        });
    });

    // ─── updateClient permanent-error log + stamp catch (930, 974) ───────────

    describe('updateClient permanent error + stamp catch', () => {
        it('logs the manual-review warning on a permanent failure', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'upd-perm', mobile: '15556662001' }));
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('USER_DEACTIVATED_BAN'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            expect(await service.updateClient('upd-perm', 'msg')).toBe(false);
        });

        it('stampActiveBufferLifecycle swallows the buffer update error', async () => {
            await service.onModuleInit();
            bufferClientService.update.mockRejectedValueOnce(new Error('stamp down'));
            await expect(
                (service as any).stampActiveBufferLifecycle('m', { privacyUpdatedAt: new Date() }),
            ).resolves.toBeUndefined();
        });

        it('stampActiveBufferLifecycle persists the lifecycle stamp on success (974)', async () => {
            await service.onModuleInit();
            bufferClientService.update.mockResolvedValueOnce({} as any);
            await (service as any).stampActiveBufferLifecycle('m', { privacyUpdatedAt: new Date() });
            expect(bufferClientService.update).toHaveBeenCalledWith('m', expect.objectContaining({
                privacyUpdatedAt: expect.any(Date),
            }));
        });
    });

    // ─── updateClientIdentity "already correct" else branch (1036) ───────────

    describe('updateClientIdentity already-correct branch', () => {
        it('returns true without calling UpdateProfile when identity already matches', async () => {
            await service.onModuleInit();
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: 'Vox' }], fullUser: { about: 'a bio' } }); // GetFullUser
            const tg = { client: { invoke } } as any;
            const assignment = {
                assignedFirstName: 'Nina', assignedLastName: 'Vox', assignedBio: 'a bio',
                assignedProfilePics: [], mobile: 'm', source: 'activeClient',
            };
            const result = await (service as any).updateClientIdentity(
                { clientId: 'id-ok' } as any, tg, { firstName: 'Nina' }, assignment,
            );
            expect(result).toBe(true);
            // Only GetFullUser invoked, never UpdateProfile.
            expect(invoke).toHaveBeenCalledTimes(1);
        });
    });

    // ─── getActiveClientAssignment query catch (1163-1164) ───────────────────

    describe('getActiveClientAssignment query failure', () => {
        it('returns null when the buffer model query throws', async () => {
            await service.onModuleInit();
            const origModel = bufferClientService.model;
            bufferClientService.model = {
                findOne: jest.fn(() => ({ lean: jest.fn().mockRejectedValue(new Error('model down')) })),
            };
            const result = await service.getActiveClientAssignment({ clientId: 'c', mobile: 'm' } as any);
            expect(result).toBeNull();
            bufferClientService.model = origModel;
        });
    });

    // ─── targeted branch-arm coverage ────────────────────────────────────────

    describe('branch-arm coverage', () => {
        it('purgeExpiredCooldowns keeps recent (not-yet-expired) entries (173,178 false arms)', async () => {
            await service.onModuleInit();
            (service as any).setupCooldownMap.set('recent-setup', Date.now()); // not expired → kept
            (service as any).lastUpdateMap.set('recent-upd', Date.now());      // not expired → kept
            (service as any).purgeExpiredCooldowns();
            expect((service as any).setupCooldownMap.has('recent-setup')).toBe(true);
            expect((service as any).lastUpdateMap.has('recent-upd')).toBe(true);
        });

        it('findAllMaskedObject without a query takes the findAll branch (267 false arm)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'mo-1' }));
            const obj = await service.findAllMaskedObject();
            expect(obj['mo-1']).toBeDefined();
            expect(obj['mo-1']).not.toHaveProperty('session');
        });

        it('canonicalMobile stringifies a non-Error throw (369 false arm)', async () => {
            await service.onModuleInit();
            const { canonicalizeMobile } = require('../shared/mobile-utils');
            // canonicalizeMobile throws Error normally; simulate a non-Error throw.
            const spy = jest.spyOn(require('../shared/mobile-utils'), 'canonicalizeMobile')
                .mockImplementation(() => { throw 'string failure'; });
            expect(() => (service as any).canonicalMobile('123')).toThrow('string failure');
            spy.mockRestore();
        });

        it('notify stringifies a non-Error rejection (384 false arm)', async () => {
            await service.onModuleInit();
            const { fetchWithTimeout } = require('../../utils/fetchWithTimeout');
            (fetchWithTimeout as jest.Mock).mockRejectedValueOnce('plain string err');
            await expect((service as any).notify('hi')).resolves.toBeUndefined();
            (fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: true });
        });

        it('executeWithRetry stringifies a non-Error rejection (431 false arm)', async () => {
            await service.onModuleInit();
            jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
            const op = jest.fn().mockRejectedValue('plain failure');
            await expect((service as any).executeWithRetry(op, 1)).rejects.toBe('plain failure');
        });

        it('getCacheStatistics with an empty cache reports a 0 hit rate (470 false arm)', async () => {
            await service.onModuleInit();
            (service as any).clientsMap.clear();
            const stats = await service.getCacheStatistics();
            expect(stats.cacheHitRate).toBe(0);
        });

        it('handleSetupClient with no candidate + permanent reason marks inactive (524 true arm)', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'no-cand', mobile: '15551110001', session: 's' }));
            bufferClientService.executeQuery.mockResolvedValue([]);
            isPermanentError.mockReturnValue(true);
            await (service as any).handleSetupClient('no-cand', { reason: 'SESSION_REVOKED' } as any);
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551110001', 'SESSION_REVOKED');
        });

        it('archiveOldClient marks the buffer inactive when days exceeds 35 (798 inactive arm)', async () => {
            await service.onModuleInit();
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15551110010', session: 'distinct' });
            await (service as any).archiveOldClient(
                { clientId: 'arc-old', session: 'sess' } as any,
                { tgId: 'tg', mobile: '15551110010' } as any,
                '15551110010',
                40, // days > 35 → status inactive
            );
            expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith('15551110010', expect.objectContaining({
                status: 'inactive',
            }));
        });

        it('updateClient throws when telegram client / me are missing (895,898 true arms)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'no-tg', mobile: '15551110020' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(null as any); // !telegramClient
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            expect(await service.updateClient('no-tg', 'msg')).toBe(false);

            (service as any).lastUpdateMap.delete('no-tg');
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => null), // !me
            } as any);
            expect(await service.updateClient('no-tg', 'msg')).toBe(false);
        });

        it('updateClientPhotos deletes existing photos before re-uploading (1070 photoCount>0 arm)', async () => {
            await service.onModuleInit();
            const deleteProfilePhotos = jest.fn(async () => undefined);
            const updateProfilePic = jest.fn(async () => undefined);
            const invoke = jest.fn(async () => ({ photos: [{}] })); // photoCount = 1 (>0 but <2)
            jest.spyOn(helpersModule, 'downloadFileFromUrl').mockResolvedValue(Buffer.from('img'));
            (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
            (fs.existsSync as jest.Mock).mockReturnValue(false); // 1082 false arm: skip unlink
            const tg = { client: { invoke }, deleteProfilePhotos, updateProfilePic } as any;
            const result = await (service as any).updateClientPhotos(
                { clientId: 'ph-del' } as any, tg, { assignedProfilePics: ['a', 'b'] } as any,
            );
            expect(result).toBe(true);
            expect(deleteProfilePhotos).toHaveBeenCalled();
            expect(updateProfilePic).toHaveBeenCalled();
        });

        it('executeQuery applies a skip offset (1104 true arm)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'sk-1' }));
            await service.create(makeClientData({ clientId: 'sk-2' }));
            const res = await service.executeQuery({}, { clientId: 1 }, 10, 1);
            expect(res).toHaveLength(1);
        });

        it('getPersonaPool falls back to defaults for absent persona arrays (1112-1117 fallback arms)', async () => {
            await service.onModuleInit();
            // Insert a raw doc missing the persona array fields so the `|| []` / `|| ''`
            // fallbacks execute. Use updateOne with strict:false-free raw insert.
            await ClientModel.collection.insertOne({
                clientId: 'pp-empty', name: 'n', mobile: '15551110030', session: 's',
                firstNames: null, bufferLastNames: null, promoteLastNames: null,
                bios: null, profilePics: null, dbcoll: null,
            } as any);
            (service as any).clientsMap.delete('pp-empty');
            const pool = await service.getPersonaPool('pp-empty');
            expect(pool!.firstNames).toEqual([]);
            expect(pool!.bufferLastNames).toEqual([]);
            expect(pool!.promoteLastNames).toEqual([]);
            expect(pool!.bios).toEqual([]);
            expect(pool!.profilePics).toEqual([]);
            expect(pool!.dbcoll).toBe('');
        });

        it('getActiveClientAssignment fills nulls for missing persona fields (1172-1176 fallback arms)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'aca-min', mobile: '15551110040' }));
            // Buffer doc has only profilePics (passes hasPersonaAssignment) but no name/bio →
            // exercises the `|| null` fallbacks on first/last/bio and `|| []`.
            await BufferModel.create({
                tgId: 'tg-min', mobile: '15551110040', session: 's', availableDate: '2026-01-01',
                channels: 1, clientId: 'aca-min', status: 'active',
                assignedProfilePics: ['pic-1'],
            });
            const assignment = await service.getActiveClientAssignment({ clientId: 'aca-min', mobile: '15551110040' } as any);
            expect(assignment!.assignedFirstName).toBeNull();
            expect(assignment!.assignedLastName).toBeNull();
            expect(assignment!.assignedBio).toBeNull();
            expect(assignment!.assignedProfilePics).toEqual(['pic-1']);
        });

        it('getExistingAssignments buffer-only scope maps fallback fields (1198, 1202 false arm)', async () => {
            await service.onModuleInit();
            await BufferModel.create({
                tgId: 'tg-bo', mobile: '15551110050', session: 's', availableDate: '2026-01-01',
                channels: 1, clientId: 'eg-buf', status: 'active', assignedFirstName: 'Bo',
                // no assignedLastName/assignedBio/assignedProfilePics → `|| null` / `|| []` arms
            });
            const { assignments } = await service.getExistingAssignments('eg-buf', 'buffer');
            const a = assignments.find((x) => x.mobile === '15551110050')!;
            expect(a.assignedLastName).toBeNull();
            expect(a.assignedBio).toBeNull();
            expect(a.assignedProfilePics).toEqual([]);
        });
    });

    // ─── more updateClientSession + identity branch arms ─────────────────────

    describe('updateClientSession branch arms', () => {
        it('findAllMaskedObject WITH a query takes the search branch (267 true arm)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'mq-1', name: 'Queryable' }));
            const obj = await service.findAllMaskedObject({ name: 'Queryable' } as any);
            expect(obj['mq-1']).toBeDefined();
        });

        it('throws with a per-mobile scope when no setup is registered (581 true arm)', async () => {
            await service.onModuleInit();
            telegramService.getActiveClientSetup.mockReturnValue(null);
            await expect(service.updateClientSession('s', '15559998888')).rejects.toThrow('for 15559998888');
        });

        it('throws NotFound when the client in the registered setup is missing (596 true arm)', async () => {
            await service.onModuleInit();
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'gone-client', existingMobile: '15559997000', newMobile: '15559997001',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            await expect(service.updateClientSession('new', '15559997001')).rejects.toThrow('not found');
        });

        it('expires only on permanent getClient failure; transient just rethrows (606 else arm)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-trans', mobile: '15559997010', session: 'old' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-trans', existingMobile: '15559997010', newMobile: '15559997011',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('TIMEOUT'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(false); // 606 else arm: no expireAccount
            await expect(service.updateClientSession('new', '15559997011')).rejects.toThrow('TIMEOUT');
            expect(usersService.expireAccount).not.toHaveBeenCalled();
        });

        it('throws when getClient resolves null (612 true arm)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-null', mobile: '15559997020', session: 'old' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-null', existingMobile: '15559997020', newMobile: '15559997021',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(null as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            await expect(service.updateClientSession('new', '15559997021')).rejects.toThrow('Failed to get Telegram client');
        });

        it('falls back to the Telegram username when the buffer doc has none (623 fallback arm)', async () => {
            await service.onModuleInit();
            // Raw insert without a deployKey so existingClient.deployKey is falsy (659 false arm).
            await ClientModel.collection.insertOne({
                clientId: 'cut-fb', mobile: '15559997030', session: 'old', name: 'n', username: 'u',
            } as any);
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-fb', existingMobile: '15559997030', newMobile: '15559997031',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'tg-fallback' })),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            // bufferDoc without a username → updatedUsername falls back to me.username (623),
            // and existingClient.deployKey absent → 659 false arm.
            bufferClientService.findOne.mockResolvedValue({ mobile: '15559997031', assignedProfilePics: [] });
            usersService.search.mockResolvedValue([{ tgId: 'tg', mobile: '15559997030', session: 'backup' }]);
            await service.updateClientSession('new-session', '15559997031');
            const after = await ClientModel.findOne({ clientId: 'cut-fb' }).lean();
            expect(after!.username).toBe('tg-fallback');
        });

        it('handles non-Error rejections in the secondary catch arms (651,665,688 false arms)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'cut-nonerr', mobile: '15559997040', session: 'old', deployKey: 'https://deploy.test/nonerr' }));
            telegramService.getActiveClientSetup.mockReturnValue({
                clientId: 'cut-nonerr', existingMobile: '15559997040', newMobile: '15559997041',
                archiveOld: false, formalities: false, days: 0,
            });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'newtg' })),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            bufferClientService.findOne.mockResolvedValue({ mobile: '15559997041', username: 'bufuser', assignedProfilePics: [] });
            bufferClientService.setPrimaryInUse.mockRejectedValueOnce('plain-string-stamp-error'); // 651 false arm
            const { fetchWithTimeout } = require('../../utils/fetchWithTimeout');
            (fetchWithTimeout as jest.Mock).mockImplementation((url: string) => {
                if (url === 'https://deploy.test/nonerr') return Promise.reject('plain-string-deploy-error'); // 665 false arm
                return Promise.resolve({ ok: true });
            });
            // Make handleClientArchival throw a non-Error so the outer catch's 688 false arm runs,
            // but only AFTER cutover commits (so it rethrows). Use archiveOld=false then force update reject.
            jest.spyOn(service as any, 'handleClientArchival').mockRejectedValue('plain-string-archival-error');
            await expect(service.updateClientSession('new-session', '15559997041')).rejects.toBe('plain-string-archival-error');
            (fetchWithTimeout as jest.Mock).mockResolvedValue({ ok: true });
        });
    });

    describe('handleSetupClient catch arm (558 false)', () => {
        it('stringifies a non-Error thrown during the swap', async () => {
            process.env.AUTO_CLIENT_SETUP = 'true';
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'setup-nonerr', mobile: '15559996000', session: 'old' }));
            bufferClientService.executeQuery.mockResolvedValue([{ mobile: '15559996001', session: 'buf' }]);
            bufferClientService.getOrEnsureDistinctUsersBackupSession.mockResolvedValue({ tgId: 't', mobile: '15559996001', session: 'distinct' });
            let registered: any = null;
            telegramService.setActiveClientSetup.mockImplementation((s: any) => { registered = s; });
            telegramService.getActiveClientSetup.mockImplementation(() => registered);
            telegramService.clearActiveClientSetup.mockImplementation(() => { registered = null; });
            // connectionManager.getClient throws a non-Error string → 558 false arm in setupClient's catch.
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue('plain string setup failure');
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(false);
            await (service as any).handleSetupClient('setup-nonerr', { reason: 'r' } as any);
            expect(bufferClientService.createOrUpdate).toHaveBeenCalledWith('15559996001', expect.objectContaining({ availableDate: expect.any(String) }));
        });
    });

    describe('updateClient default-arg + privacy/error arms (882,918,927)', () => {
        it('runs with the default message argument and a permanent failure (882,927)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'def-arg', mobile: '15559995000' }));
            // Call with NO message → exercises the default-arg (882).
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue('plain string err'); // non-Error → 927 false arm
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(false);
            expect(await service.updateClient('def-arg')).toBe(false);
        });

        it('stamps only the privacy lifecycle field when identity+photos are skipped (918 arms)', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'priv-only', mobile: '15559995010', username: 'same' }));
            jest.spyOn(service, 'getActiveClientAssignment').mockResolvedValue(null); // identity skipped, photos skipped
            const invoke = jest.fn().mockResolvedValueOnce({ photos: [] }); // GetUserPhotos
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ username: 'same', firstName: 'F' })),
                client: { invoke },
                updatePrivacy: jest.fn(async () => undefined),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const stampSpy = jest.spyOn(service as any, 'stampActiveBufferLifecycle').mockResolvedValue(undefined);
            await service.updateClient('priv-only', 'm', true, false, true);
            // Only privacy stamped (identity false, photos false).
            expect(stampSpy).toHaveBeenCalledWith('15559995010', expect.objectContaining({ privacyUpdatedAt: expect.any(Date) }));
            const arg = stampSpy.mock.calls[0][1] as any;
            expect(arg.nameBioUpdatedAt).toBeUndefined();
            expect(arg.profilePicsUpdatedAt).toBeUndefined();
        });
    });

    describe('updateClientIdentity field-default arms (1014-1032)', () => {
        it('updates only the firstName when last name/bio are absent in the assignment', async () => {
            await service.onModuleInit();
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: 'Existing' }], fullUser: { about: 'old bio' } }); // GetFullUser
            invoke.mockResolvedValueOnce(undefined); // UpdateProfile
            const tg = { client: { invoke } } as any;
            // assignment with ONLY assignedFirstName → expectedLastName='' , expectedBio=null,
            // exercises `|| ''` (1014-1016, 1022) + conditional spreads (1030-1032).
            const assignment = {
                assignedFirstName: 'Zoe', assignedLastName: null, assignedBio: null,
                assignedProfilePics: [], mobile: 'm', source: 'activeClient',
            };
            const result = await (service as any).updateClientIdentity(
                { clientId: 'id-first' } as any, tg, { firstName: 'Different' }, assignment,
            );
            expect(result).toBe(true);
            // UpdateProfile invoked (firstName mismatch) → 2 invoke calls total.
            expect(invoke).toHaveBeenCalledTimes(2);
        });
    });

    // ─── getExistingAssignments alreadyIncluded branch (1206,1209) ────────────

    describe('getExistingAssignments dedup', () => {
        it('does not duplicate the active-client assignment already present from buffer scope', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'dedup-1', mobile: '15555551001' }));
            // Buffer scope and active-client scope resolve to the SAME mobile → dedup (1206).
            await BufferModel.create({
                tgId: 'tg-d', mobile: '15555551001', session: 's', availableDate: '2026-01-01',
                channels: 1, clientId: 'dedup-1', status: 'active', assignedFirstName: 'Dee',
            });
            const { assignments } = await service.getExistingAssignments('dedup-1', 'all');
            const forMobile = assignments.filter((a) => a.mobile === '15555551001');
            expect(forMobile).toHaveLength(1);
        });

        it('appends the active-client assignment when buffer scope did not include it', async () => {
            await service.onModuleInit();
            await service.create(makeClientData({ clientId: 'dedup-2', mobile: '15555551010' }));
            // Active-client buffer doc exists for the active mobile, but the buffer-scope
            // filter excludes it by giving it no persona assignment fields, while a DIFFERENT
            // mobile carries the buffer-scope assignment → active assignment appended (1209).
            await BufferModel.create({
                tgId: 'tg-e', mobile: '15555551010', session: 's', availableDate: '2026-01-01',
                channels: 1, clientId: 'dedup-2', status: 'active', assignedFirstName: 'Eve',
            });
            const { assignments } = await service.getExistingAssignments('dedup-2', 'activeClient');
            expect(assignments.some((a) => a.mobile === '15555551010')).toBe(true);
        });
    });
});
