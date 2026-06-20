import { Controller, ExecutionContext, Get, INestApplication, Query, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import request from 'supertest';
import { AuthGuard } from './auth.guard';

const sendMessageByCategory = jest.fn();
let botsInstance: any = { sendMessageByCategory };

jest.mock('../utils', () => {
    const actual = jest.requireActual('../utils');
    return {
        ...actual,
        getBotsServiceInstance: () => botsInstance,
    };
});

@Controller('debug-query')
class DebugQueryController {
    @Get()
    echo(@Query() query: Record<string, unknown>) {
        return query;
    }
}

function makeContext(request: Partial<Request>): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
    } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
    let app: INestApplication | undefined;

    afterEach(async () => {
        if (app) {
            await app.close();
            app = undefined;
        }
    });

    it('removes apiKey from query params after successful key auth', () => {
        const guard = new AuthGuard();
        const request = {
            path: '/user/search',
            url: '/user/search?mobile=919064405198&apiKey=SANTOOR',
            originalUrl: '/user/search?mobile=919064405198&apiKey=SANTOOR',
            headers: {},
            query: {
                mobile: '919064405198',
                apiKey: 'SANTOOR',
            },
            ip: '203.0.113.10',
            connection: {},
        } as unknown as Partial<Request>;

        expect(guard.canActivate(makeContext(request))).toBe(true);
        expect(request.query).toEqual({ mobile: '919064405198' });
    });

    it('removes api key aliases from origin-authorized requests', () => {
        const guard = new AuthGuard();
        const request = {
            path: '/promoteclients/search',
            url: '/promoteclients/search?mobile=919064405198&apikey=ignored&api_key=ignored',
            originalUrl: '/promoteclients/search?mobile=919064405198&apikey=ignored&api_key=ignored',
            headers: {
                origin: 'https://paidgirls.site',
            },
            query: {
                mobile: '919064405198',
                apikey: 'ignored',
                api_key: 'ignored',
            },
            ip: '203.0.113.10',
            connection: {},
        } as unknown as Partial<Request>;

        expect(guard.canActivate(makeContext(request))).toBe(true);
        expect(request.query).toEqual({ mobile: '919064405198' });
    });

    it('removes apiKey from ignored paths before controllers can read query params', () => {
        const guard = new AuthGuard();
        const request = {
            path: '/health',
            url: '/health?apiKey=SANTOOR',
            originalUrl: '/health?apiKey=SANTOOR',
            headers: {},
            query: {
                apiKey: 'SANTOOR',
            },
            ip: '203.0.113.10',
            connection: {},
        } as unknown as Partial<Request>;

        expect(guard.canActivate(makeContext(request))).toBe(true);
        expect(request.query).toEqual({});
    });

    it('sanitizes query params before controller @Query handlers receive them', async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [DebugQueryController],
            providers: [
                {
                    provide: APP_GUARD,
                    useClass: AuthGuard,
                },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();

        await request(app.getHttpServer())
            .get('/debug-query?mobile=919064405198&apiKey=SANTOOR')
            .expect(200)
            .expect({ mobile: '919064405198' });
    });

    describe('branch coverage', () => {
        beforeEach(() => {
            sendMessageByCategory.mockReset();
            botsInstance = { sendMessageByCategory };
        });

        const baseReq = (overrides: Partial<Request> = {}): Partial<Request> => ({
            path: '/user/search',
            url: '/user/search',
            originalUrl: '/user/search',
            headers: {},
            query: {},
            ip: '203.0.113.99',
            connection: {} as any,
            ...overrides,
        });

        it('grants access via x-api-key header (case-insensitive)', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { 'x-api-key': 'SANTOOR' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('grants access via apiKey query alias', () => {
            const guard = new AuthGuard();
            const req = baseReq({
                url: '/user/search?apiKey=santoor',
                originalUrl: '/user/search?apiKey=santoor',
                query: { apiKey: 'santoor' },
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
            expect(req.query).toEqual({});
        });

        it('grants access via IP whitelist (cf-connecting-ip header)', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { 'cf-connecting-ip': '31.97.59.2' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('grants access via x-real-ip header in whitelist', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { 'x-real-ip': '148.230.84.50' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('grants access via x-forwarded-for (first entry) in whitelist', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { 'x-forwarded-for': '13.228.225.19, 10.0.0.1' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        // Regression: a header sent multiple times arrives as string[] from Express. The IP
        // extractor calls .split(',') on it, which throws TypeError -> NestJS returns 500
        // instead of a clean 401. Any unauthenticated caller can trigger this trivially.
        it('does NOT crash (500) on an array-valued x-forwarded-for header', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { 'x-forwarded-for': ['9.9.9.9', '8.8.8.8'] as any } });
            let thrown: any;
            try {
                guard.canActivate(makeContext(req));
            } catch (e) {
                thrown = e;
            }
            // Clean deny (401), never a raw TypeError.
            expect(thrown).toBeInstanceOf(UnauthorizedException);
        });

        it('normalizes an array-valued cf-connecting-ip to its first value (allowlist match)', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { 'cf-connecting-ip': ['31.97.59.2', '9.9.9.9'] as any } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('grants access via request.ip (stripping ::ffff:) in whitelist', () => {
            const guard = new AuthGuard();
            const req = baseReq({ ip: '::ffff:18.142.128.26' });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('grants access via connection.remoteAddress in whitelist when ip missing', () => {
            const guard = new AuthGuard();
            const req = baseReq({ ip: undefined, connection: { remoteAddress: '::ffff:54.254.162.138' } as any });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('returns unknown IP and denies when no IP source available', () => {
            const guard = new AuthGuard();
            const req = baseReq({ ip: undefined, connection: {} as any });
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        describe('TRUST_PROXY_HEADERS=false (spoofable-header hardening)', () => {
            const prev = process.env.TRUST_PROXY_HEADERS;
            afterEach(() => {
                if (prev === undefined) delete process.env.TRUST_PROXY_HEADERS;
                else process.env.TRUST_PROXY_HEADERS = prev;
            });

            it('IGNORES a spoofed cf-connecting-ip header and denies based on the real socket peer', () => {
                process.env.TRUST_PROXY_HEADERS = 'false';
                const guard = new AuthGuard();
                // Attacker spoofs an allowlisted IP in the header, but the real peer (203.0.113.99) is not allowed.
                const req = baseReq({ headers: { 'cf-connecting-ip': '31.97.59.2' }, ip: '203.0.113.99' });
                expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
            });

            it('still allows a genuinely-allowlisted real socket peer when headers are not trusted', () => {
                process.env.TRUST_PROXY_HEADERS = 'false';
                const guard = new AuthGuard();
                const req = baseReq({ headers: {}, ip: '31.97.59.2' });
                expect(guard.canActivate(makeContext(req))).toBe(true);
            });

            it('default (header trust on) honors cf-connecting-ip as before', () => {
                delete process.env.TRUST_PROXY_HEADERS;
                const guard = new AuthGuard();
                const req = baseReq({ headers: { 'cf-connecting-ip': '31.97.59.2' }, ip: '203.0.113.99' });
                expect(guard.canActivate(makeContext(req))).toBe(true);
            });
        });

        it('grants access via origin whitelist', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { origin: 'https://paidgirls.site' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('denies disallowed origin', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { origin: 'https://evil.example.com' } });
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        it('treats invalid origin URL as not allowed', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { origin: 'not-a-url' } });
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        it('derives origin from x-original-host header', () => {
            const guard = new AuthGuard();
            const req = baseReq({
                headers: { 'x-original-host': 'paidgirls.site', 'x-forwarded-proto': 'https' },
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('derives origin from x-forwarded-host header', () => {
            const guard = new AuthGuard();
            const req = baseReq({
                headers: { 'x-forwarded-host': 'paidgirls.site', 'x-forwarded-proto': 'https' },
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('derives origin from host header', () => {
            const guard = new AuthGuard();
            const req = baseReq({
                headers: { host: 'paidgirls.site', 'x-forwarded-proto': 'https' },
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('derives origin from referer header', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { referer: 'https://paidgirls.site/some/page' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('handles invalid referer gracefully and denies', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { referer: 'http://[invalid' } });
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        it('uses cf-visitor scheme for protocol when present', () => {
            const guard = new AuthGuard();
            const req = baseReq({
                headers: { host: 'paidgirls.site', 'cf-visitor': '{"scheme":"https"}' },
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('handles malformed cf-visitor JSON gracefully (falls back to http -> denied)', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { host: 'paidgirls.site', 'cf-visitor': '{bad json' } });
            // protocol falls back to http (not production) -> http://paidgirls.site not in allowed -> denied
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        it('uses request.secure for https protocol', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { host: 'paidgirls.site' }, secure: true } as any);
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('uses x-forwarded-ssl=on for https protocol', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { host: 'paidgirls.site', 'x-forwarded-ssl': 'on' } });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('uses https protocol in production env', () => {
            const guard = new AuthGuard();
            const prev = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            try {
                const req = baseReq({ headers: { host: 'paidgirls.site' } });
                expect(guard.canActivate(makeContext(req))).toBe(true);
            } finally {
                process.env.NODE_ENV = prev;
            }
        });

        it('matches ignored path via regex pattern', () => {
            const guard = new AuthGuard();
            const req = baseReq({ path: '/userdata/123', url: '/userdata/123', originalUrl: '/userdata/123' });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('allows GET /builds without auth (read is public)', () => {
            const guard = new AuthGuard();
            const req = baseReq({ path: '/builds', url: '/builds', originalUrl: '/builds', method: 'GET' });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });

        it('DENIES PATCH /builds without auth (write must be protected)', () => {
            // /builds is in IGNORE_PATHS for the public GET, but the PATCH that overwrites
            // build/deploy config must NOT be reachable unauthenticated.
            const guard = new AuthGuard();
            const req = baseReq({ path: '/builds', url: '/builds', originalUrl: '/builds', method: 'PATCH', headers: {}, ip: '203.0.113.99' });
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        it('notifies on unauthorized access', () => {
            const guard = new AuthGuard();
            const req = baseReq({ headers: { origin: 'https://evil.com' } });
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
            expect(sendMessageByCategory).toHaveBeenCalled();
        });

        it('handles missing bots service during notification', () => {
            botsInstance = undefined;
            const guard = new AuthGuard();
            const req = baseReq();
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
            expect(sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('handles notification error gracefully', () => {
            botsInstance = {
                sendMessageByCategory: () => {
                    throw new Error('notify boom');
                },
            };
            const guard = new AuthGuard();
            const req = baseReq();
            expect(() => guard.canActivate(makeContext(req))).toThrow(UnauthorizedException);
        });

        it('redacts api key in url when query has no parsable url (catch fallback)', () => {
            const guard = new AuthGuard();
            // originalUrl that triggers URL parse failure path in stripQuerySecret via a relative invalid form
            const req = baseReq({
                headers: { 'x-api-key': 'santoor' },
                url: 'http://[bad?apiKey=secret',
                originalUrl: 'http://[bad?apiKey=secret',
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
            expect(req.url).not.toContain('secret');
        });

        it('handles request with no url fields to sanitize', () => {
            const guard = new AuthGuard();
            const req = baseReq({
                headers: { 'x-api-key': 'santoor' },
                url: '' as any,
                originalUrl: '' as any,
                path: '/user/search',
            });
            expect(guard.canActivate(makeContext(req))).toBe(true);
        });
    });
});
