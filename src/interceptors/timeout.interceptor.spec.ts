import { CallHandler, ExecutionContext, RequestTimeoutException } from '@nestjs/common';
import { lastValueFrom, of, throwError, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { TimeoutInterceptor } from './timeout.interceptor';

const ctx = {} as ExecutionContext;

describe('TimeoutInterceptor', () => {
    it('passes through values that complete before the timeout', async () => {
        const interceptor = new TimeoutInterceptor(1000);
        const next: CallHandler = { handle: () => of('ok') };
        const result = await lastValueFrom(interceptor.intercept(ctx, next));
        expect(result).toBe('ok');
    });

    it('maps a TimeoutError into RequestTimeoutException', async () => {
        const interceptor = new TimeoutInterceptor(10);
        // emits after 50ms which exceeds the 10ms timeout
        const next: CallHandler = { handle: () => timer(50).pipe(map(() => 'late')) };
        await expect(lastValueFrom(interceptor.intercept(ctx, next))).rejects.toBeInstanceOf(
            RequestTimeoutException,
        );
    });

    it('re-throws non-timeout errors unchanged', async () => {
        const interceptor = new TimeoutInterceptor(1000);
        const original = new Error('downstream failure');
        const next: CallHandler = { handle: () => throwError(() => original) };
        await expect(lastValueFrom(interceptor.intercept(ctx, next))).rejects.toBe(original);
    });

    it('uses the default timeout when none provided', async () => {
        const interceptor = new TimeoutInterceptor();
        const next: CallHandler = { handle: () => of('default-ok') };
        const result = await lastValueFrom(interceptor.intercept(ctx, next));
        expect(result).toBe('default-ok');
    });
});
