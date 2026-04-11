import { UsersService } from '../users.service';
import { connectionManager } from '../../Telegram/utils/connection-manager';

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return {
        ...actual,
        sleep: jest.fn(() => Promise.resolve()),
    };
});

describe('UsersService', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    test('create stores the signup session once and does not create an immediate backup session', async () => {
        const modelInstances: any[] = [];

        const MockUserModel: any = function MockUserModel(this: any, doc: any) {
            Object.assign(this, doc);
            this.save = jest.fn().mockResolvedValue({ ...doc });
            modelInstances.push(this);
        };

        MockUserModel.updateMany = jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        });

        const telegramService = {
            getActiveClientSetup: jest.fn(() => null),
            createNewSession: jest.fn(),
        };
        const clientsService = {
            updateClientSession: jest.fn(),
        };
        const botsService = {
            sendMessageByCategory: jest.fn().mockResolvedValue(undefined),
        };

        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getCallLogStats: jest.fn().mockResolvedValue({ chats: [] }),
            getTopPrivateChats: jest.fn().mockResolvedValue({ items: [] }),
            getContacts: jest.fn().mockResolvedValue({ users: [] }),
            getchatId: jest.fn(),
            client: { invoke: jest.fn() },
        } as any);
        const unregisterSpy = jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const service = new UsersService(
            MockUserModel,
            telegramService as any,
            clientsService as any,
            botsService as any,
        );

        await service.create({
            mobile: '9199990001',
            session: 'signup-session',
            firstName: 'User',
            lastName: '',
            username: 'user1',
            tgId: 'tg-1',
            twoFA: false,
            password: null,
            expired: false,
            stats: {
                channels: 0, personalChats: 0, totalChats: 0, contacts: 0, msgs: 0,
                photoCount: 0, videoCount: 0, movieCount: 0,
                ownPhotoCount: 0, otherPhotoCount: 0, ownVideoCount: 0, otherVideoCount: 0,
                lastActive: '2026-04-11',
            },
            calls: { totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 },
        } as any);

        await jest.advanceTimersByTimeAsync(5000);

        expect(modelInstances).toHaveLength(1);
        expect(modelInstances[0].save).toHaveBeenCalledTimes(1);
        expect(telegramService.createNewSession).not.toHaveBeenCalled();
        expect(unregisterSpy).toHaveBeenCalledWith('9199990001');
    });
});
