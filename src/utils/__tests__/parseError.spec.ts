jest.mock('axios', () => {
  const get = jest.fn();
  return {
    __esModule: true,
    default: { get, isAxiosError: jest.fn(() => false) },
    get,
    isAxiosError: jest.fn(() => false),
  };
});
jest.mock('../logbots', () => ({
  notifbot: jest.fn(() => 'https://api.telegram.org/bottok/sendMessage?chat_id=-1'),
}));

import axios from 'axios';
import { notifbot } from '../logbots';
import {
  parseError,
  extractMessage,
  createError,
  isAxiosError,
  ErrorUtils,
} from '../parseError';

const mockedNotifbot = notifbot as jest.Mock;

const mockedAxiosGet = (axios as any).get as jest.Mock;

describe('extractMessage', () => {
  test('returns empty string for null/undefined', () => {
    expect(extractMessage(null)).toBe('');
    expect(extractMessage(undefined)).toBe('');
  });

  test('formats primitives with and without a path', () => {
    expect(extractMessage('hi')).toBe('hi');
    expect(extractMessage(42)).toBe('42');
    expect(extractMessage(5, 'count')).toBe('count=5');
  });

  test('extracts message/name/stack from an Error', () => {
    const err = new Error('boom');
    const out = extractMessage(err);
    expect(out).toContain('message=boom');
    expect(out).toContain('name=Error');
  });

  test('prefixes Error info with the path', () => {
    const out = extractMessage(new Error('x'), 'ctx');
    expect(out.startsWith('ctx=(')).toBe(true);
  });

  test('flattens arrays and skips empties', () => {
    expect(extractMessage([])).toBe('');
    expect(extractMessage(['a', 'b'])).toBe('[0]=a\n[1]=b');
  });

  test('walks nested objects', () => {
    const out = extractMessage({ a: 1, b: { c: 'x' } });
    expect(out).toContain('a=1');
    expect(out).toContain('b.c=x');
  });

  test('caps recursion at maxDepth', () => {
    const out = extractMessage({ a: 'v' }, 'root', 10, 5);
    expect(out).toContain('Max Depth Reached');
  });

  test('returns the empty-string fallback for unsupported types (symbol/function)', () => {
    expect(extractMessage(Symbol('x') as unknown as any)).toBe('');
    expect(extractMessage((() => {}) as unknown as any)).toBe('');
  });

  test('returns an error string when traversal throws (throwing getter)', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const evil: any = {};
    Object.defineProperty(evil, 'boom', {
      enumerable: true,
      get() { throw new Error('getter exploded'); },
    });
    const out = extractMessage(evil);
    expect(out).toContain('Error extracting message');
    errSpy.mockRestore();
  });

  test('omits empty message/name/stack fields from an Error', () => {
    // Error with a blank message and a stripped stack → the `? : ''` false sides.
    const err = new Error('');
    err.stack = undefined;
    const out = extractMessage(err);
    // No message=, no stack= lines; name is still present.
    expect(out).not.toContain('message=');
    expect(out).not.toContain('stack=');
    expect(out).toContain('name=Error');
  });

  test('prefixes array indices with the parent path', () => {
    // Array branch with a non-empty path → `${path}[${index}]`.
    const out = extractMessage(['x', 'y'], 'items');
    expect(out).toBe('items[0]=x\nitems[1]=y');
  });

  test('skips object keys whose extracted value is empty', () => {
    // `if (extracted)` false side — null/empty-array values yield '' and are dropped.
    const out = extractMessage({ keep: 'v', dropNull: null, dropEmpty: [] });
    expect(out).toContain('keep=v');
    expect(out).not.toContain('dropNull');
    expect(out).not.toContain('dropEmpty');
  });

  test('stringifies a non-Error thrown during traversal', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const evil: any = {};
    Object.defineProperty(evil, 'boom', {
      enumerable: true,
      get() { throw 'plain string explosion'; }, // non-Error throw → String(error) branch
    });
    const out = extractMessage(evil);
    expect(out).toContain('plain string explosion');
    errSpy.mockRestore();
  });
});

describe('parseError - error-shape extraction matrix', () => {
  const realEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = realEnv; });

  test('extracts status from the deeper response fallbacks (response.status)', () => {
    // response.data has none of statusCode/status/ResponseCode → falls through to response.status.
    const r = parseError({ response: { data: {}, status: 503 } }, undefined, false);
    expect(r.status).toBe(503);
  });

  test('falls back to err.status when response carries no usable status', () => {
    const r = parseError({ response: { data: {} }, status: 418 }, undefined, false);
    expect(r.status).toBe(418);
  });

  test('extracts message from a string response body', () => {
    // responseData is a string → the `typeof responseData === 'string'` branch.
    const r = parseError({ response: { data: 'upstream exploded' } }, undefined, false);
    expect(r.message).toContain('upstream exploded');
  });

  test('uses response.statusText when the body has no message field', () => {
    const r = parseError({ response: { data: {}, statusText: 'Gateway Timeout' } }, undefined, false);
    expect(r.message).toContain('Gateway Timeout');
  });

  test('extracts message from an err.request (no response received) path', () => {
    const r = parseError({ request: {}, data: 'request body message', message: 'm' }, undefined, false);
    expect(r.message).toContain('request body message');
  });

  test('non-string rawMessage is run through extractMessage', () => {
    // err whose message is an object → the `typeof rawMessage === 'string'` false branch (line 314).
    const r = parseError({ response: { data: { message: { nested: 'deep reason' } } } }, undefined, false);
    expect(r.message).toContain('deep reason');
  });

  test('prefers err.errorMessage for the notification when not in test env', () => {
    // The notification block is gated on NODE_ENV !== "test"; flip it to exercise line 338.
    process.env.NODE_ENV = 'production';
    const r = parseError({ errorMessage: 'explicit notify text', response: { data: {} } }, 'prefix', true);
    // Response message still reflects the parsed error; the errorMessage drives the (un-awaited) notification.
    expect(r.message).toBe('explicit notify text');
  });
});

describe('createError', () => {
  test('builds a standardized error object with defaults', () => {
    expect(createError('oops')).toEqual({ status: 500, message: 'oops', error: 'ApplicationError' });
  });
  test('honors custom status and type', () => {
    expect(createError('bad', 400, 'BadRequest')).toEqual({ status: 400, message: 'bad', error: 'BadRequest' });
  });
});

describe('isAxiosError', () => {
  test('delegates to axios.isAxiosError', () => {
    expect(isAxiosError(new Error('x'))).toBe(false);
    expect((axios as any).isAxiosError).toHaveBeenCalled();
  });
});

describe('parseError', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test', clientId: 'svc-1' };
    mockedAxiosGet.mockReset();
  });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  test('parses a plain Error message', () => {
    const res = parseError(new Error('something failed'), 'prefix');
    expect(res.status).toBe(500);
    expect(res.message).toContain('something failed');
    expect(res.error).toBe('Error');
    expect(res.raw).toBeInstanceOf(Error);
  });

  test('extracts status and message from an axios-style response', () => {
    const err = {
      response: { status: 404, data: { message: 'Not found', error: 'NotFound' } },
    };
    const res = parseError(err, undefined, false);
    expect(res.status).toBe(404);
    expect(res.message).toContain('Not found');
    expect(res.error).toBe('NotFound');
  });

  test('extracts from response.data.statusCode and errors fields', () => {
    const err = { response: { data: { statusCode: 422, errors: 'validation failed' } } };
    const res = parseError(err, undefined, false);
    expect(res.status).toBe(422);
    expect(res.message).toContain('validation failed');
  });

  test('handles a request-only (no response) error', () => {
    const err = { request: {}, message: 'no response received' };
    const res = parseError(err, undefined, false);
    expect(res.message).toContain('no response received');
  });

  test('uses a falsy-default message when nothing else is present on a request error', () => {
    const err = { request: {} };
    const res = parseError(err, undefined, false);
    expect(res.message).toContain('The request was triggered but no response was received');
  });

  test('prefers an explicit errorMessage property', () => {
    const res = parseError({ errorMessage: 'custom msg', message: 'ignored' }, undefined, false);
    expect(res.message).toBe('custom msg');
  });

  test('truncates very long messages to maxMessageLength', () => {
    const longMsg = 'x'.repeat(500);
    const res = parseError({ message: longMsg }, undefined, false, { maxMessageLength: 50 });
    expect(res.message.length).toBeLessThanOrEqual(50);
  });

  test('extracts error type from name/code fallbacks', () => {
    const codeErr: any = { message: 'm', code: 'ECONNREFUSED' };
    expect(parseError(codeErr, undefined, false).error).toBe('ECONNREFUSED');
  });

  test('uses default config values when error has no recognizable fields', () => {
    const res = parseError({}, undefined, false);
    expect(res.status).toBe(500);
    expect(res.error).toBe('UnknownError');
    expect(res.message).toContain('An unknown error occurred');
  });

  test('falls back to a FatalError response when error access throws (null err)', () => {
    // Accessing err.errorMessage on null throws -> caught by the outer catch.
    const res = parseError(null, undefined, false);
    expect(res.status).toBe(500);
    expect(res.error).toBe('FatalError');
    expect(res.message).toBe('Error in error handling');
    expect(res.raw).toBeNull();
  });

  test('does NOT send a notification in test environment', () => {
    parseError(new Error('boom'), 'p', true);
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  test('sends a notification outside test env for a non-ignored error', async () => {
    process.env.NODE_ENV = 'production';
    mockedAxiosGet.mockResolvedValue({ status: 200 });
    parseError(new Error('a fresh failure'), 'pfx', true);
    // notification is fired-and-forgotten; allow the microtask queue to flush
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedAxiosGet).toHaveBeenCalled();
    const calledUrl = mockedAxiosGet.mock.calls[0][0];
    expect(calledUrl).toContain('https://api.telegram.org');
  });

  test('does not send a notification for ignored patterns (e.g. ECONNREFUSED)', () => {
    process.env.NODE_ENV = 'production';
    parseError({ message: 'ECONNREFUSED at host' }, 'pfx', true);
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  test('does not send a notification for 429 status', () => {
    process.env.NODE_ENV = 'production';
    parseError({ response: { status: 429, data: { message: 'rate limited' } } }, 'pfx', true);
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  test('catches errors thrown while preparing the notification', () => {
    process.env.NODE_ENV = 'production';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedNotifbot.mockImplementationOnce(() => { throw new Error('notifbot boom'); });
    // Should not throw despite notifbot blowing up.
    const res = parseError(new Error('a notify-prep failure'), 'pfx', true);
    expect(res.message).toContain('a notify-prep failure');
    expect(errSpy).toHaveBeenCalledWith('Failed to prepare error notification:', expect.any(Error));
    errSpy.mockRestore();
  });
});

describe('ErrorUtils.sendNotification', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    mockedAxiosGet.mockReset();
  });

  test('rejects invalid URLs without calling axios', async () => {
    const res = await ErrorUtils.sendNotification('not-a-url');
    expect(res).toBeUndefined();
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  test('returns the response for a valid URL', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 200 });
    const res = await ErrorUtils.sendNotification('https://example.com/notify');
    expect(res).toEqual({ status: 200 });
    expect(mockedAxiosGet).toHaveBeenCalledWith('https://example.com/notify', expect.objectContaining({ timeout: expect.any(Number) }));
  });

  test('returns undefined when axios throws', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('network'));
    const res = await ErrorUtils.sendNotification('https://example.com/notify');
    expect(res).toBeUndefined();
  });

  test('passes a validateStatus that accepts <500 and rejects >=500', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 200 });
    await ErrorUtils.sendNotification('https://example.com/notify');
    const opts = mockedAxiosGet.mock.calls[0][1];
    expect(typeof opts.validateStatus).toBe('function');
    expect(opts.validateStatus(404)).toBe(true);
    expect(opts.validateStatus(500)).toBe(false);
  });

  test('logs failures when logFailures is true and not in test env', async () => {
    process.env.NODE_ENV = 'production';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAxiosGet.mockRejectedValue(new Error('connection refused'));
    const res = await ErrorUtils.sendNotification('https://example.com/notify', 1000, true);
    expect(res).toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('Failed to send notification:', 'connection refused');
    errSpy.mockRestore();
  });

  test('logs an invalid URL when logFailures is true and not in test env', async () => {
    process.env.NODE_ENV = 'production';
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await ErrorUtils.sendNotification('ftp://bad', 1000, true);
    expect(res).toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('Invalid notification URL:', 'ftp://bad');
    errSpy.mockRestore();
  });
});
