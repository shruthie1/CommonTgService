import { BadRequestException } from '@nestjs/common';
import { ClientService } from '../client.service';

describe('ClientService session separation safeguards', () => {
    function makeService(overrides?: {
        telegramService?: any;
        bufferClientService?: any;
        usersService?: any;
    }) {
        return new ClientService(
            {} as any,
            {} as any,
            overrides?.telegramService || { createNewSession: jest.fn() },
            overrides?.bufferClientService || {
                executeQuery: jest.fn(),
                createOrUpdate: jest.fn(),
                update: jest.fn(),
                ensureDistinctUsersBackupSession: jest.fn(async () => true),
                getOrEnsureDistinctUsersBackupSession: jest.fn(async () => ({ tgId: 'tg-default', mobile: '90000', session: 'backup-session' })),
            },
            overrides?.usersService || { search: jest.fn(), update: jest.fn() },
        );
    }

    test('assertDistinctUserBackupSession reuses an already distinct backup session', async () => {
        const usersService = {
            search: jest.fn().mockResolvedValue([{ tgId: 'tg-1', mobile: '90001', session: 'backup-session' }]),
            update: jest.fn(),
        };
        const bufferClientService = {
            getOrEnsureDistinctUsersBackupSession: jest.fn().mockResolvedValue({ tgId: 'tg-1', mobile: '90001', session: 'backup-session' }),
        };
        const service = makeService({ usersService, bufferClientService });

        const result = await (service as any).assertDistinctUserBackupSession('90001', 'active-session');

        expect(result).toEqual({ tgId: 'tg-1', mobile: '90001', session: 'backup-session' });
        expect(bufferClientService.getOrEnsureDistinctUsersBackupSession).toHaveBeenCalledWith('90001', 'active-session');
        expect(usersService.update).not.toHaveBeenCalled();
    });

    test('assertDistinctUserBackupSession refreshes the user after repairing duplicate backup sessions before setup/archive', async () => {
        const usersByMobile = new Map<string, any>([
            ['90002', { tgId: 'tg-2', mobile: '90002', session: 'active-session' }],
        ]);
        const usersService = {
            search: jest.fn(async ({ mobile }: { mobile: string }) => {
                const user = usersByMobile.get(mobile);
                return user ? [user] : [];
            }),
            update: jest.fn(),
        };
        const bufferClientService = {
            getOrEnsureDistinctUsersBackupSession: jest.fn(async (mobile: string) => {
                const updatedUser = { ...usersByMobile.get(mobile), session: 'fresh-backup-session' };
                usersByMobile.set(mobile, updatedUser);
                return updatedUser;
            }),
        };
        const service = makeService({ usersService, bufferClientService });

        const result = await (service as any).assertDistinctUserBackupSession('90002', 'active-session');

        expect(bufferClientService.getOrEnsureDistinctUsersBackupSession).toHaveBeenCalledWith('90002', 'active-session');
        expect(result.session).toBe('fresh-backup-session');
    });

    test('findSafeSetupBufferCandidate skips same-session candidate and repairs duplicated user backup on valid candidate', async () => {
        const usersByMobile = new Map<string, any>([
            ['90011', { tgId: 'tg-11', mobile: '90011', session: 'same-as-buffer' }],
            ['90022', { tgId: 'tg-22', mobile: '90022', session: 'candidate-session' }],
        ]);
        const usersService = {
            search: jest.fn(async ({ mobile }: { mobile: string }) => {
                const user = usersByMobile.get(mobile);
                return user ? [user] : [];
            }),
            update: jest.fn(async (tgId: string, updateDto: { session: string }) => {
                for (const [mobile, user] of usersByMobile.entries()) {
                    if (user.tgId === tgId) {
                        usersByMobile.set(mobile, { ...user, session: updateDto.session });
                    }
                }
                return 1;
            }),
        };
        const bufferClientService = {
            getOrEnsureDistinctUsersBackupSession: jest.fn(async (mobile: string, activeSession: string) => {
                const user = usersByMobile.get(mobile);
                if (!user) return null;
                if (user.session === activeSession) {
                    const updatedUser = { ...user, session: `backup-${mobile}` };
                    usersByMobile.set(mobile, updatedUser);
                    return updatedUser;
                }
                return user;
            }),
        };
        const service = makeService({ usersService, bufferClientService });

        const candidate = await (service as any).findSafeSetupBufferCandidate(
            [
                { mobile: '90000', session: 'current-main-session' },
                { mobile: '90011', session: 'same-as-buffer' },
                { mobile: '90022', session: 'candidate-session' },
            ],
            'current-main-session',
        );

        expect(candidate).toEqual({
            mobile: '90011',
            session: 'same-as-buffer',
            backupUser: { tgId: 'tg-11', mobile: '90011', session: 'backup-90011' },
        });
        expect(bufferClientService.getOrEnsureDistinctUsersBackupSession).toHaveBeenCalledWith('90011', 'same-as-buffer');
        expect(usersByMobile.get('90011').session).toBe('backup-90011');
    });

    test('assertDistinctUserBackupSession fails when a distinct backup cannot be created', async () => {
        const usersService = {
            search: jest.fn().mockResolvedValue([{ tgId: 'tg-3', mobile: '90003', session: 'active-session' }]),
            update: jest.fn(),
        };
        const bufferClientService = {
            getOrEnsureDistinctUsersBackupSession: jest.fn().mockResolvedValue(null),
        };
        const service = makeService({ usersService, bufferClientService });

        await expect((service as any).assertDistinctUserBackupSession('90003', 'active-session'))
            .rejects
            .toBeInstanceOf(BadRequestException);
    });

    test('updateClientSession fails fast when no active setup exists', async () => {
        const telegramService = {
            getActiveClientSetup: jest.fn().mockReturnValue(undefined),
        };
        const service = makeService({ telegramService });

        await expect(service.updateClientSession('replacement-session'))
            .rejects
            .toBeInstanceOf(BadRequestException);
    });
});
