import { BadRequestException, HttpStatus } from '@nestjs/common';
import { TgSignupController } from '../tg-signup.controller';

function makeStub() {
    return {
        sendCode: jest.fn(),
        verifyCode: jest.fn(),
    };
}

describe('TgSignupController', () => {
    let stub: ReturnType<typeof makeStub>;
    let controller: TgSignupController;

    beforeEach(() => {
        stub = makeStub();
        controller = new TgSignupController(stub as any);
    });

    describe('sendCode', () => {
        it('returns CREATED response on success', async () => {
            stub.sendCode.mockResolvedValue({ phoneCodeHash: 'h', isCodeViaApp: true });
            const result = await controller.sendCode({ phone: '+919999000001' } as any);
            expect(result).toEqual({
                status: HttpStatus.CREATED,
                message: 'Code sent to your Telegram App',
                phoneCodeHash: 'h',
                isCodeViaApp: true,
            });
            expect(stub.sendCode).toHaveBeenCalledWith('+919999000001');
        });

        it('logs and rethrows on error', async () => {
            const err = new Error('boom');
            stub.sendCode.mockRejectedValue(err);
            await expect(controller.sendCode({ phone: '+91999' } as any)).rejects.toBe(err);
        });
    });

    describe('verifyCode', () => {
        it('returns BAD_REQUEST when requires2FA true', async () => {
            stub.verifyCode.mockResolvedValue({ requires2FA: true, message: 'need 2fa', session: undefined });
            const result = await controller.verifyCode({ phone: '+91', code: '12345' } as any);
            expect(result).toEqual({
                status: HttpStatus.BAD_REQUEST,
                message: 'need 2fa',
                session: undefined,
                requires2FA: true,
            });
            expect(stub.verifyCode).toHaveBeenCalledWith('+91', '12345', undefined);
        });

        it('returns OK with message fallback when requires2FA false/undefined', async () => {
            stub.verifyCode.mockResolvedValue({ session: 'sess-1' });
            const result = await controller.verifyCode({ phone: '+91', code: '12345', password: 'pw' } as any);
            expect(result).toEqual({
                status: HttpStatus.OK,
                message: 'Successfully logged in',
                session: 'sess-1',
                requires2FA: undefined,
            });
            expect(stub.verifyCode).toHaveBeenCalledWith('+91', '12345', 'pw');
        });

        it('logs and rethrows on error', async () => {
            const err = new Error('verify boom');
            stub.verifyCode.mockRejectedValue(err);
            await expect(controller.verifyCode({ phone: '+91', code: '12345' } as any)).rejects.toBe(err);
        });
    });

    // Raw phone numbers (and the 2FA password hint inside a rejected verify) must not reach the PM2 logs.
    describe('log redaction', () => {
        const PHONE = '+919812345678';
        const logged = () => {
            const logger = (controller as any).logger;
            return [...logger.debug.mock.calls, ...logger.error.mock.calls]
                .map(args => args.map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a, (_k, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v)))).join(' '))
                .join('\n');
        };

        beforeEach(() => {
            const logger = (controller as any).logger;
            jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
            jest.spyOn(logger, 'error').mockImplementation(() => undefined);
        });

        it('sendCode logs no 10+ digit run, on success and on error', async () => {
            stub.sendCode.mockResolvedValueOnce({ phoneCodeHash: 'h' });
            await controller.sendCode({ phone: PHONE } as any);
            stub.sendCode.mockRejectedValueOnce(new Error('boom'));
            await expect(controller.sendCode({ phone: PHONE } as any)).rejects.toThrow('boom');
            expect(logged()).toContain('5678');
            expect(logged()).not.toMatch(/\d{10,}/);
        });

        it('verifyCode logs no 10+ digit run and no 2FA hint, while the thrown error keeps the hint', async () => {
            stub.verifyCode.mockResolvedValueOnce({ session: 's' });
            await controller.verifyCode({ phone: PHONE, code: '12345' } as any);
            const err = new BadRequestException('Incorrect 2FA password (hint: my dog rex)');
            stub.verifyCode.mockRejectedValueOnce(err);
            await expect(controller.verifyCode({ phone: PHONE, code: '12345', password: 'x' } as any)).rejects.toBe(err);
            expect(err.message).toBe('Incorrect 2FA password (hint: my dog rex)');
            expect(logged()).not.toMatch(/\d{10,}/);
            expect(logged()).not.toContain('my dog rex');
            expect(logged()).toContain('Incorrect 2FA password (hint: [redacted])');
        });
    });
});
