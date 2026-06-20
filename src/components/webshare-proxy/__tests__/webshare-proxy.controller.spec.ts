import { HttpException, HttpStatus } from '@nestjs/common';
import { WebshareProxyController } from '../webshare-proxy.controller';

function makeServiceStub() {
    return {
        getStatus: jest.fn(),
        syncProxies: jest.fn(),
        refreshAndSync: jest.fn(),
        replaceProxy: jest.fn(),
        getProxyConfig: jest.fn(),
    };
}

describe('WebshareProxyController', () => {
    let stub: ReturnType<typeof makeServiceStub>;
    let controller: WebshareProxyController;

    beforeEach(() => {
        stub = makeServiceStub();
        controller = new WebshareProxyController(stub as any);
    });

    describe('getStatus', () => {
        it('returns status', async () => {
            stub.getStatus.mockResolvedValue({ configured: true });
            expect(await controller.getStatus()).toEqual({ configured: true });
        });
        it('throws 500 on error', async () => {
            stub.getStatus.mockRejectedValue(new Error('fail'));
            await expect(controller.getStatus()).rejects.toMatchObject({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
            });
        });
    });

    describe('syncProxies', () => {
        it('defaults removeStale true when dto undefined', async () => {
            stub.syncProxies.mockResolvedValue({ created: 1 });
            await controller.syncProxies(undefined);
            expect(stub.syncProxies).toHaveBeenCalledWith(true);
        });
        it('defaults removeStale true when removeStale not false', async () => {
            stub.syncProxies.mockResolvedValue({ created: 1 });
            await controller.syncProxies({ removeStale: true } as any);
            expect(stub.syncProxies).toHaveBeenCalledWith(true);
        });
        it('passes false when removeStale=false', async () => {
            stub.syncProxies.mockResolvedValue({ created: 1 });
            await controller.syncProxies({ removeStale: false } as any);
            expect(stub.syncProxies).toHaveBeenCalledWith(false);
        });
        it('throws BAD_REQUEST on error', async () => {
            stub.syncProxies.mockRejectedValue(new Error('boom'));
            await expect(controller.syncProxies(undefined)).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });
        });
    });

    describe('refreshAndSync', () => {
        it('returns result', async () => {
            stub.refreshAndSync.mockResolvedValue({ created: 2 });
            expect(await controller.refreshAndSync()).toEqual({ created: 2 });
        });
        it('throws BAD_REQUEST on error', async () => {
            stub.refreshAndSync.mockRejectedValue(new Error('boom'));
            await expect(controller.refreshAndSync()).rejects.toBeInstanceOf(HttpException);
        });
    });

    describe('replaceProxy', () => {
        it('passes dto fields', async () => {
            stub.replaceProxy.mockResolvedValue({ success: true });
            await controller.replaceProxy({ ipAddress: '1.1.1.1', port: 80, preferredCountry: 'US' } as any);
            expect(stub.replaceProxy).toHaveBeenCalledWith('1.1.1.1', 80, 'US');
        });
        it('throws BAD_REQUEST on error', async () => {
            stub.replaceProxy.mockRejectedValue(new Error('boom'));
            await expect(controller.replaceProxy({ ipAddress: 'x', port: 1 } as any))
                .rejects.toBeInstanceOf(HttpException);
        });
    });

    describe('getProxyConfig', () => {
        it('returns config', async () => {
            stub.getProxyConfig.mockResolvedValue({ username: 'u' });
            expect(await controller.getProxyConfig()).toEqual({ username: 'u' });
        });
        it('throws BAD_REQUEST on error', async () => {
            stub.getProxyConfig.mockRejectedValue(new Error('boom'));
            await expect(controller.getProxyConfig()).rejects.toBeInstanceOf(HttpException);
        });
    });
});
