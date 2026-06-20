import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { CloudflareCacheInterceptor } from './cloudflare-cache.interceptor';
import { CLOUDFLARE_CACHE_KEY, NO_CACHE_KEY } from '../decorators';

function makeContext(res: { setHeader: jest.Mock }): ExecutionContext {
    return {
        switchToHttp: () => ({ getResponse: () => res }),
        getHandler: () => function handler() {},
    } as unknown as ExecutionContext;
}

const handler: CallHandler = { handle: () => of('payload') };

describe('CloudflareCacheInterceptor', () => {
    it('sets no-store headers when NoCache metadata is present', async () => {
        const reflector = {
            get: jest.fn((key) => (key === NO_CACHE_KEY ? true : undefined)),
        } as unknown as Reflector;
        const interceptor = new CloudflareCacheInterceptor(reflector);
        const setHeader = jest.fn();
        const result = await lastValueFrom(
            interceptor.intercept(makeContext({ setHeader }), handler),
        );

        expect(result).toBe('payload');
        expect(setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate',
        );
        expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
        expect(setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    it('sets public cache headers when CloudflareCache metadata is present', async () => {
        const reflector = {
            get: jest.fn((key) =>
                key === CLOUDFLARE_CACHE_KEY ? { edge: 600, browser: 60 } : undefined,
            ),
        } as unknown as Reflector;
        const interceptor = new CloudflareCacheInterceptor(reflector);
        const setHeader = jest.fn();
        const result = await lastValueFrom(
            interceptor.intercept(makeContext({ setHeader }), handler),
        );

        expect(result).toBe('payload');
        expect(setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'public, max-age=60, s-maxage=600',
        );
    });

    it('sets no headers when neither metadata is present', async () => {
        const reflector = { get: jest.fn(() => undefined) } as unknown as Reflector;
        const interceptor = new CloudflareCacheInterceptor(reflector);
        const setHeader = jest.fn();
        const result = await lastValueFrom(
            interceptor.intercept(makeContext({ setHeader }), handler),
        );

        expect(result).toBe('payload');
        expect(setHeader).not.toHaveBeenCalled();
    });
});
