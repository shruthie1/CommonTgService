import { Controller, ExecutionContext, Get, INestApplication, Query } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import request from 'supertest';
import { AuthGuard } from './auth.guard';

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
                origin: 'https://paidgirl.site',
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
});
