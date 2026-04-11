import { MailReader } from '../../../../IMap/IMap';
import { set2fa } from '../auth-operations';

describe('set2fa', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('uses the mailbox exclusively and requests a fresh code with the expected length', async () => {
        const fakeMailReader = {
            runExclusive: jest.fn(async (operation: () => Promise<unknown>) => operation()),
            connectToMail: jest.fn().mockResolvedValue(undefined),
            isMailReady: jest.fn().mockResolvedValue(true),
            getCode: jest
                .fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce('12345'),
            disconnectFromMail: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(fakeMailReader as any);

        const invoke = jest.fn().mockResolvedValue({ hasPassword: false });
        const updateTwoFaSettings = jest.fn(async (options: any) => {
            const codePromise = options.emailCodeCallback(5);
            await jest.advanceTimersByTimeAsync(20_000);
            const code = await codePromise;

            expect(code).toBe('12345');
            expect(fakeMailReader.getCode).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    expectedLength: 5,
                    minReceivedAt: expect.any(Date),
                }),
            );
            expect(fakeMailReader.getCode).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({
                    expectedLength: 5,
                    minReceivedAt: expect.any(Date),
                }),
            );
        });

        const ctx = {
            client: {
                invoke,
                updateTwoFaSettings,
            },
            phoneNumber: '9990001234',
            logger: {
                info: jest.fn(),
                error: jest.fn(),
            },
        } as any;

        const resultPromise = set2fa(ctx);
        await jest.runAllTimersAsync();
        const result = await resultPromise;

        expect(fakeMailReader.runExclusive).toHaveBeenCalledTimes(1);
        expect(fakeMailReader.connectToMail).toHaveBeenCalledWith(30_000);
        expect(fakeMailReader.disconnectFromMail).toHaveBeenCalledTimes(1);
        expect(updateTwoFaSettings).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            email: 'storeslaksmi@gmail.com',
            hint: 'password - India143',
            newPassword: 'Ajtdmwajt1@',
        });
    });

    test('disconnects the mailbox if the Telegram 2FA update fails', async () => {
        const fakeMailReader = {
            runExclusive: jest.fn(async (operation: () => Promise<unknown>) => operation()),
            connectToMail: jest.fn().mockResolvedValue(undefined),
            isMailReady: jest.fn().mockResolvedValue(true),
            getCode: jest.fn(),
            disconnectFromMail: jest.fn().mockResolvedValue(undefined),
        };
        jest.spyOn(MailReader, 'getInstance').mockReturnValue(fakeMailReader as any);

        const ctx = {
            client: {
                invoke: jest.fn().mockResolvedValue({ hasPassword: false }),
                updateTwoFaSettings: jest.fn().mockRejectedValue(new Error('tg failed')),
            },
            phoneNumber: '9990001235',
            logger: {
                info: jest.fn(),
                error: jest.fn(),
            },
        } as any;

        await expect(set2fa(ctx)).rejects.toThrow('tg failed');
        expect(fakeMailReader.disconnectFromMail).toHaveBeenCalledTimes(1);
    });
});
