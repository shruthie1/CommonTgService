import { HttpStatus } from '@nestjs/common';
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
});
