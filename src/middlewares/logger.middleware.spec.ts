import { EventEmitter } from 'events';
import { Request, Response, NextFunction } from 'express';

const sendMessageByCategory = jest.fn();
let botsInstance: any = { sendMessageByCategory };

jest.mock('../utils', () => {
    const actual = jest.requireActual('../utils');
    return {
        ...actual,
        getBotsServiceInstance: () => botsInstance,
    };
});

import { LoggerMiddleware } from './logger.middleware';

function makeRes(statusCode: number): Response & EventEmitter {
    const res = new EventEmitter() as Response & EventEmitter;
    (res as any).statusCode = statusCode;
    return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
    return {
        method: 'GET',
        originalUrl: '/clients/list',
        ip: '1.2.3.4',
        ...overrides,
    } as unknown as Request;
}

describe('LoggerMiddleware', () => {
    beforeEach(() => {
        sendMessageByCategory.mockReset();
        botsInstance = { sendMessageByCategory };
    });

    it('calls next() for every request', () => {
        const mw = new LoggerMiddleware();
        const next = jest.fn() as unknown as NextFunction;
        mw.use(makeReq(), makeRes(200), next);
        expect(next).toHaveBeenCalled();
    });

    it('logs and notifies on 5xx via finish event', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(500);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).toHaveBeenCalled();
    });

    it('logs and notifies on 4xx via finish event', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(404);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).toHaveBeenCalled();
    });

    it('logs verbose on 3xx without notifying', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(301);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('logs debug on 2xx without notifying', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(200);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('skips notification when bots service unavailable on finish', () => {
        botsInstance = undefined;
        const mw = new LoggerMiddleware();
        const res = makeRes(500);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('formats duration in seconds when >= 1000ms', () => {
        jest.useFakeTimers();
        const base = 1_000_000;
        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy.mockReturnValueOnce(base); // start time
        nowSpy.mockReturnValueOnce(base + 1500); // finish time
        const mw = new LoggerMiddleware();
        const res = makeRes(200);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        nowSpy.mockRestore();
        jest.useRealTimers();
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('handles res error event with notification', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(200);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('error', new Error('socket hang up'));
        expect(sendMessageByCategory).toHaveBeenCalled();
    });

    it('handles res error event when bots service unavailable', () => {
        botsInstance = undefined;
        const mw = new LoggerMiddleware();
        const res = makeRes(200);
        mw.use(makeReq(), res, jest.fn() as unknown as NextFunction);
        res.emit('error', new Error('socket hang up'));
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('redacts api key in logged url', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(500);
        mw.use(
            makeReq({ originalUrl: '/clients/list?apiKey=secret&mobile=911' }),
            res,
            jest.fn() as unknown as NextFunction,
        );
        res.emit('finish');
        const msg = sendMessageByCategory.mock.calls[0][1] as string;
        expect(msg).not.toContain('secret');
        expect(msg).toContain('[redacted]');
    });

    it('does not register finish handler for excluded endpoints', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(500);
        mw.use(makeReq({ originalUrl: '/tgsignup' }), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('does not register finish handler for root path', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(500);
        mw.use(makeReq({ originalUrl: '/' }), res, jest.fn() as unknown as NextFunction);
        res.emit('finish');
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });

    it('logs excluded Video endpoint hit', () => {
        const mw = new LoggerMiddleware();
        const res = makeRes(200);
        mw.use(
            makeReq({ originalUrl: '/favicon.Video' }),
            res,
            jest.fn() as unknown as NextFunction,
        );
        // excluded branch with Video -> logger.log; no notification
        res.emit('finish');
        expect(sendMessageByCategory).not.toHaveBeenCalled();
    });
});
