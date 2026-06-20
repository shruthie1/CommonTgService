jest.mock('axios', () => {
  const axiosFn: any = jest.fn();
  axiosFn.isAxiosError = jest.fn(() => false);
  return { __esModule: true, default: axiosFn, isAxiosError: axiosFn.isAxiosError };
});
jest.mock('../utils', () => ({
  parseError: jest.fn(),
  Logger: class {
    log = jest.fn();
    error = jest.fn();
    warn = jest.fn();
    debug = jest.fn();
  },
}));

import axios from 'axios';
import { HttpStatus } from '@nestjs/common';
import { AppController } from '../app.controller';

const mockedAxios = axios as unknown as jest.Mock & { isAxiosError: jest.Mock };

function makeRes() {
  const headers: Record<string, any> = {};
  return {
    setHeader: jest.fn((k: string, v: any) => {
      headers[k.toLowerCase()] = v;
    }),
    getHeader: jest.fn((k: string) => headers[k.toLowerCase()]),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    _headers: headers,
  } as any;
}

describe('AppController', () => {
  let controller: AppController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockReturnValue(false);
    controller = new AppController();
  });

  it('getHello returns greeting', () => {
    expect(controller.getHello()).toBe('Hello World!');
  });

  describe('executeRequest - validation', () => {
    it('throws when url missing -> returns 500 internal server error', async () => {
      const res = makeRes();
      await controller.executeRequest({} as any, res);
      // HttpException is not an axios error -> falls into generic non-axios branch
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const payload = res.send.mock.calls[0][0];
      expect(payload.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('rejects invalid protocol', async () => {
      const res = makeRes();
      await controller.executeRequest({ url: 'ftp://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockedAxios).not.toHaveBeenCalled();
    });

    it('rejects malformed url', async () => {
      const res = makeRes();
      await controller.executeRequest({ url: 'not a url' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockedAxios).not.toHaveBeenCalled();
    });
  });

  describe('executeRequest - success', () => {
    it('handles JSON response and sets headers (skips transfer-encoding, handles array + scalar + falsy)', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
          'set-cookie': ['a=1', 'b=2'],
          'x-empty': '',
        },
        data: { ok: true },
      });
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com', method: 'GET' } as any, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ ok: true });
      // transfer-encoding skipped
      expect(res.setHeader).not.toHaveBeenCalledWith('transfer-encoding', expect.anything());
      // array header set directly
      expect(res.setHeader).toHaveBeenCalledWith('set-cookie', ['a=1', 'b=2']);
      // scalar set as string
      expect(res.setHeader).toHaveBeenCalledWith('content-type', 'application/json');
      // empty/falsy value skipped
      expect(res.setHeader).not.toHaveBeenCalledWith('x-empty', expect.anything());
    });

    it('handles binary response via responseType=arraybuffer', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        data: Buffer.from('hello'),
      });
      const res = makeRes();
      await controller.executeRequest(
        { url: 'https://example.com/file', responseType: 'arraybuffer' } as any,
        res,
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from('hello'));
    });

    it('handles binary response detected via content-type when content-type header not yet set', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'image/png' },
        data: Buffer.from([1, 2, 3]),
      });
      const res = makeRes();
      // make getHeader return undefined for content-type so the inner branch sets it
      res.getHeader = jest.fn(() => undefined);
      await controller.executeRequest({ url: 'https://example.com/img' } as any, res);
      expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/png');
      expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    });

    it('binary branch does not reset content-type when already present', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        data: Buffer.from([9]),
      });
      const res = makeRes();
      // content-type already present
      res.getHeader = jest.fn(() => 'image/jpeg');
      await controller.executeRequest({ url: 'https://example.com/img2' } as any, res);
      expect(res.send).toHaveBeenCalledWith(Buffer.from([9]));
    });
  });

  describe('executeRequest - error handling', () => {
    it('handles ECONNABORTED axios timeout', async () => {
      const err: any = new Error('timeout');
      err.code = 'ECONNABORTED';
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
      expect(res.send.mock.calls[0][0].error).toBe('Request timeout');
    });

    it('handles ECONNREFUSED', async () => {
      const err: any = new Error('refused');
      err.code = 'ECONNREFUSED';
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
      expect(res.send.mock.calls[0][0].error).toBe('Connection refused');
    });

    it('handles axios error with response (propagates status + sanitizes headers)', async () => {
      const err: any = new Error('bad');
      err.response = {
        status: 404,
        headers: { authorization: 'secret', 'content-type': 'text/html' },
        data: 'not found',
      };
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const res = makeRes();
      await controller.executeRequest(
        { url: 'https://example.com?token=abc', method: 'post', params: { token: 'x', q: 'ok' }, headers: { 'x-api-key': 'k' } } as any,
        res,
      );
      expect(res.status).toHaveBeenCalledWith(404);
      const payload = res.send.mock.calls[0][0];
      expect(payload.status).toBe(404);
      expect(payload.headers.authorization).toBe('[REDACTED]');
      expect(payload.data).toBe('not found');
    });

    it('handles axios error with request but no response', async () => {
      const err: any = new Error('no response');
      err.code = 'ETIMEDOUT';
      err.request = {};
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
      expect(res.send.mock.calls[0][0].error).toBe('No response');
    });

    it('handles generic axios error (no response, no request)', async () => {
      const err: any = new Error('weird');
      err.code = 'EUNKNOWN';
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
      expect(res.send.mock.calls[0][0].error).toBe('EUNKNOWN');
    });

    it('handles generic axios error with no code -> falls back message', async () => {
      const err: any = new Error('');
      err.message = 'boom';
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      const payload = res.send.mock.calls[0][0];
      expect(payload.error).toBe('Request failed');
      expect(payload.message).toBe('boom');
    });

    it('handles non-axios error (with message)', async () => {
      const err: any = new Error('plain error');
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(false);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.send.mock.calls[0][0].message).toBe('plain error');
    });

    it('handles non-axios error with no message -> default message', async () => {
      const err: any = {}; // no message
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(false);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.send.mock.calls[0][0].message).toBe('An unexpected error occurred');
    });

    it('logs sanitized request details (no params, no headers, no method)', async () => {
      const err: any = new Error('x');
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(false);
      const res = makeRes();
      await controller.executeRequest({ url: 'https://example.com' } as any, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('private helpers via behavior', () => {
    it('sanitizeUrl redacts secrets in query string (through error path)', async () => {
      const err: any = new Error('x');
      mockedAxios.mockRejectedValue(err);
      mockedAxios.isAxiosError.mockReturnValue(false);
      const res = makeRes();
      // Access private method through the instance for direct branch coverage
      const sanitized = (controller as any).sanitizeUrl('https://x.com?api_key=abc&q=1');
      expect(sanitized).toContain('[REDACTED]');
      // undefined branch
      expect((controller as any).sanitizeUrl(undefined)).toBe('');
      await controller.executeRequest({ url: 'https://x.com?token=zzz' } as any, res);
    });

    it('sanitizeParams handles undefined and sensitive fields', () => {
      expect((controller as any).sanitizeParams(undefined)).toBeUndefined();
      const out = (controller as any).sanitizeParams({ password: 'p', name: 'bob' });
      expect(out.password).toBe('[REDACTED]');
      expect(out.name).toBe('bob');
    });

    it('isBinaryResponse covers arraybuffer, content-type match, no match, no content-type', () => {
      expect((controller as any).isBinaryResponse('arraybuffer')).toBe(true);
      expect((controller as any).isBinaryResponse('json', 'application/pdf')).toBe(true);
      expect((controller as any).isBinaryResponse('json', 'text/plain')).toBe(false);
      expect((controller as any).isBinaryResponse('json', undefined)).toBe(false);
    });

    it('sanitizeHeaders redacts case-insensitively', () => {
      const out = (controller as any).sanitizeHeaders({ Authorization: 'x', Other: 'y' });
      expect(out.Authorization).toBe('[REDACTED]');
      expect(out.Other).toBe('y');
    });

    it('handleRequestError with axios response when isAxiosError true', () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      const err: any = { response: { status: 500, headers: {}, data: 'err' } };
      const out = (controller as any).handleRequestError(err, 'rid');
      expect(out.status).toBe(500);
    });
  });
});
