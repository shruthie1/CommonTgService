import { ExecutionContext, HttpException } from '@nestjs/common';
import { Request } from 'express';
import { SendRateLimitGuard } from './send-rate-limit.guard';

function ctx(headers: Record<string, string> = {}, ip = '10.0.0.1'): ExecutionContext {
    const req = { headers, ip, connection: { remoteAddress: ip } } as unknown as Request;
    return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('SendRateLimitGuard', () => {
    const orig = process.env.RATE_LIMIT_SENDS_PER_MIN;
    afterEach(() => { if (orig === undefined) delete process.env.RATE_LIMIT_SENDS_PER_MIN; else process.env.RATE_LIMIT_SENDS_PER_MIN = orig; });

    it('allows up to the limit, then throws 429', () => {
        process.env.RATE_LIMIT_SENDS_PER_MIN = '3';
        const g = new SendRateLimitGuard();
        const c = ctx({ 'cf-connecting-ip': '1.2.3.4' });
        expect(g.canActivate(c)).toBe(true);
        expect(g.canActivate(c)).toBe(true);
        expect(g.canActivate(c)).toBe(true);
        // 4th within the window → 429
        try { g.canActivate(c); throw new Error('should have thrown'); }
        catch (e) { expect(e).toBeInstanceOf(HttpException); expect((e as HttpException).getStatus()).toBe(429); }
    });

    it('rate-limits PER IP (one IP hitting the cap does not block another)', () => {
        process.env.RATE_LIMIT_SENDS_PER_MIN = '2';
        const g = new SendRateLimitGuard();
        const a = ctx({ 'cf-connecting-ip': 'aaa' });
        const b = ctx({ 'cf-connecting-ip': 'bbb' });
        g.canActivate(a); g.canActivate(a);            // A at cap
        expect(() => g.canActivate(a)).toThrow(HttpException); // A blocked
        expect(g.canActivate(b)).toBe(true);           // B unaffected
    });

    it('keys on CF-Connecting-IP first (real client), not the nginx/socket IP', () => {
        process.env.RATE_LIMIT_SENDS_PER_MIN = '1';
        const g = new SendRateLimitGuard();
        // Same socket ip, DIFFERENT cf-connecting-ip → treated as different clients.
        expect(g.canActivate(ctx({ 'cf-connecting-ip': 'client-A' }, '172.16.0.1'))).toBe(true);
        expect(g.canActivate(ctx({ 'cf-connecting-ip': 'client-B' }, '172.16.0.1'))).toBe(true);
        // client-A again → its own 2nd hit exceeds limit 1
        expect(() => g.canActivate(ctx({ 'cf-connecting-ip': 'client-A' }, '172.16.0.1'))).toThrow(HttpException);
    });

    it('the sliding window frees capacity after it elapses', () => {
        process.env.RATE_LIMIT_SENDS_PER_MIN = '1';
        const now = 1_000_000;
        const spy = jest.spyOn(Date, 'now');
        try {
            const g = new SendRateLimitGuard();
            spy.mockReturnValue(now);
            expect(g.canActivate(ctx({ 'cf-connecting-ip': 'x' }))).toBe(true);
            expect(() => g.canActivate(ctx({ 'cf-connecting-ip': 'x' }))).toThrow(HttpException);
            // advance beyond the 60s window → allowed again
            spy.mockReturnValue(now + 61_000);
            expect(g.canActivate(ctx({ 'cf-connecting-ip': 'x' }))).toBe(true);
        } finally { spy.mockRestore(); }
    });

    it('falls back to socket IP when no proxy header (and honors TRUST_PROXY_HEADERS=false)', () => {
        process.env.RATE_LIMIT_SENDS_PER_MIN = '1';
        process.env.TRUST_PROXY_HEADERS = 'false';
        const g = new SendRateLimitGuard();
        // header present but NOT trusted → both requests share the socket-ip key → 2nd is 429
        expect(g.canActivate(ctx({ 'cf-connecting-ip': 'spoofed' }, '9.9.9.9'))).toBe(true);
        expect(() => g.canActivate(ctx({ 'cf-connecting-ip': 'different-spoof' }, '9.9.9.9'))).toThrow(HttpException);
        delete process.env.TRUST_PROXY_HEADERS;
    });

    it('defaults to 30/min when env is unset/invalid', () => {
        delete process.env.RATE_LIMIT_SENDS_PER_MIN;
        const g = new SendRateLimitGuard();
        const c = ctx({ 'cf-connecting-ip': 'd' });
        for (let i = 0; i < 30; i++) expect(g.canActivate(c)).toBe(true);
        expect(() => g.canActivate(c)).toThrow(HttpException); // 31st blocked
    });
});
