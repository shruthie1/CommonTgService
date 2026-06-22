/**
 * Tests for fetchWithTimeout (src/utils/fetchWithTimeout.ts).
 *
 * External boundaries mocked:
 *   - `axios` (the HTTP library) — we control success/failure per attempt.
 *   - `getBotsServiceInstance` — the notification sink.
 *   - `../common`.sleep — so retry backoff resolves instantly (no real waiting).
 *
 * Everything else (retry loop, shouldRetry, calculateBackoff, parseUrl,
 * bypass handling, notify formatting) runs for real.
 */

// ---- mock axios --------------------------------------------------------------
// axios is used as a callable (`axios(config)`) plus `.isAxiosError` and `.create`.
const axiosFn: any = jest.fn();
axiosFn.isAxiosError = jest.fn();
const bypassPost = jest.fn();
axiosFn.create = jest.fn(() => ({ post: bypassPost }));

jest.mock('axios', () => ({
    __esModule: true,
    default: axiosFn,
    isAxiosError: (...a: any[]) => axiosFn.isAxiosError(...a),
}));

// ---- mock sleep so retries don't actually wait ------------------------------
jest.mock('../common', () => ({
    sleep: jest.fn().mockResolvedValue(undefined),
}));

// ---- mock the bots notification sink ----------------------------------------
const sendMessageByCategory = jest.fn().mockResolvedValue(undefined);
// Production code reads the sink via tryGetBotsServiceInstance (non-throwing,
// returns null when unset). Mock both accessors to the same factory.
jest.mock('../bot.service.instance', () => {
    const factory = jest.fn(() => ({ sendMessageByCategory }));
    return {
        getBotsServiceInstance: factory,
        tryGetBotsServiceInstance: factory,
    };
});

import { fetchWithTimeout } from '../fetchWithTimeout';
import { sleep } from '../common';
import { tryGetBotsServiceInstance } from '../bot.service.instance';

const sleepMock = sleep as jest.Mock;
const getBots = tryGetBotsServiceInstance as jest.Mock;

// Helper to build an axios-style error.
function axiosError(opts: { code?: string; status?: number; message?: string }) {
    const err: any = new Error(opts.message || 'request failed');
    if (opts.code) err.code = opts.code;
    if (opts.status) err.response = { status: opts.status, data: {} };
    err.isAxiosError = true;
    return err;
}

beforeEach(() => {
    jest.clearAllMocks();
    axiosFn.isAxiosError.mockReturnValue(true);
    process.env.clientId = 'test-client';
    delete process.env.bypassURL;
    sendMessageByCategory.mockResolvedValue(undefined);
});

describe('input validation', () => {
    test('returns undefined for empty url', async () => {
        expect(await fetchWithTimeout('')).toBeUndefined();
        expect(axiosFn).not.toHaveBeenCalled();
    });

    test('returns undefined for malformed url', async () => {
        expect(await fetchWithTimeout('not a url')).toBeUndefined();
        expect(axiosFn).not.toHaveBeenCalled();
    });
});

describe('success path', () => {
    test('returns the axios response and clears the timeout', async () => {
        const response = { status: 200, data: 'ok' };
        axiosFn.mockResolvedValueOnce(response);
        const res = await fetchWithTimeout('https://api.example.com/path');
        expect(res).toBe(response);
        expect(axiosFn).toHaveBeenCalledTimes(1);
        // injects default headers + api key
        const cfg = axiosFn.mock.calls[0][0];
        expect(cfg.headers['x-api-key']).toBe('santoor');
        expect(cfg.url).toBe('https://api.example.com/path');
        expect(cfg.method).toBe('GET');
    });

    test('merges caller headers and method', async () => {
        axiosFn.mockResolvedValueOnce({ status: 200 });
        await fetchWithTimeout('https://api.example.com/x', {
            method: 'POST',
            headers: { Authorization: 'Bearer t' },
        });
        const cfg = axiosFn.mock.calls[0][0];
        expect(cfg.method).toBe('POST');
        expect(cfg.headers.Authorization).toBe('Bearer t');
    });
});

describe('retry logic', () => {
    test('retries retryable network errors up to maxRetries then returns undefined', async () => {
        const err = axiosError({ code: 'ECONNRESET' });
        axiosFn.mockRejectedValue(err);
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 2);
        expect(res).toBeUndefined();
        // attempts: 0,1,2 -> 3 calls
        expect(axiosFn).toHaveBeenCalledTimes(3);
        // sleeps between attempts: 2 (after attempt 0 and 1)
        expect(sleepMock).toHaveBeenCalledTimes(2);
    });

    test('retries on retryable status code (503)', async () => {
        axiosFn
            .mockRejectedValueOnce(axiosError({ status: 503 }))
            .mockResolvedValueOnce({ status: 200, data: 'recovered' });
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 3);
        expect(res).toEqual({ status: 200, data: 'recovered' });
        expect(axiosFn).toHaveBeenCalledTimes(2);
        expect(sleepMock).toHaveBeenCalledTimes(1);
    });

    test('does NOT retry on a non-retryable status (404) — returns undefined after one attempt', async () => {
        axiosFn.mockRejectedValueOnce(axiosError({ status: 404 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 3);
        expect(res).toBeUndefined();
        expect(axiosFn).toHaveBeenCalledTimes(1);
        expect(sleepMock).not.toHaveBeenCalled();
    });

    test('retries when error message contains "timeout"', async () => {
        axiosFn
            .mockRejectedValueOnce(axiosError({ message: 'connection timeout exceeded' }))
            .mockResolvedValueOnce({ status: 200 });
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 2);
        expect(res).toEqual({ status: 200 });
        expect(axiosFn).toHaveBeenCalledTimes(2);
    });

    test('maxRetries from options.retryConfig is honoured when positional arg omitted', async () => {
        axiosFn.mockRejectedValue(axiosError({ code: 'ETIMEDOUT' }));
        const res = await fetchWithTimeout('https://api.example.com/x', {
            retryConfig: { maxRetries: 1, baseDelay: 1, maxDelay: 2, jitterFactor: 0 },
        });
        expect(res).toBeUndefined();
        expect(axiosFn).toHaveBeenCalledTimes(2); // attempts 0 and 1
    });

    test('maxRetries: 0 via options is honoured (single attempt, no retry)', async () => {
        // Regression: `?? DEFAULT` (not `|| DEFAULT`) so an explicit 0 is not
        // swallowed and silently turned into the default of 3.
        axiosFn.mockRejectedValue(axiosError({ code: 'ETIMEDOUT' }));
        const res = await fetchWithTimeout('https://api.example.com/x', {
            retryConfig: { maxRetries: 0 },
        });
        expect(res).toBeUndefined();
        expect(axiosFn).toHaveBeenCalledTimes(1); // attempt 0 only, no retry
    });

    test('default maxRetries (3) when nothing provided -> 4 attempts', async () => {
        axiosFn.mockRejectedValue(axiosError({ code: 'ECONNREFUSED' }));
        const res = await fetchWithTimeout('https://api.example.com/x');
        expect(res).toBeUndefined();
        expect(axiosFn).toHaveBeenCalledTimes(4);
    });
});

describe('timeout notification branch', () => {
    test('ECONNABORTED triggers timeout notification', async () => {
        axiosFn.mockRejectedValueOnce(axiosError({ code: 'ECONNABORTED' }));
        // ECONNABORTED is in RETRYABLE_NETWORK_ERRORS so it would retry; cap at 0
        await fetchWithTimeout('https://api.example.com/x', {}, 0);
        // notifyInternal was invoked (sendMessageByCategory) for the timeout
        expect(getBots).toHaveBeenCalled();
        expect(sendMessageByCategory).toHaveBeenCalled();
    });
});

describe('bypass branch (403/495)', () => {
    test('403 with successful bypass returns bypass response', async () => {
        process.env.bypassURL = 'https://bypass.example.com/execute';
        axiosFn.mockRejectedValueOnce(axiosError({ status: 403 }));
        bypassPost.mockResolvedValueOnce({ status: 200, data: 'bypassed', headers: {} });
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 1);
        expect(res).toEqual({ status: 200, data: 'bypassed', headers: {} });
        expect(bypassPost).toHaveBeenCalled();
    });

    test('495 bypass converts binary octet-stream response data to a Buffer', async () => {
        process.env.bypassURL = 'https://bypass.example.com/execute';
        axiosFn.mockRejectedValueOnce(axiosError({ status: 495 }));
        bypassPost.mockResolvedValueOnce({
            status: 200,
            data: [1, 2, 3],
            headers: { 'content-type': 'application/octet-stream' },
        });
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 1);
        expect(Buffer.isBuffer(res!.data)).toBe(true);
    });

    test('bypass without a configured URL fails and notifies, returns undefined', async () => {
        // no bypassURL/env -> makeBypassRequest throws "Bypass URL is not provided"
        axiosFn.mockRejectedValueOnce(axiosError({ status: 403 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined();
        expect(bypassPost).not.toHaveBeenCalled();
        // a "Bypass attempt failed" notification should have been attempted
        expect(sendMessageByCategory).toHaveBeenCalled();
    });

    test('non-http bypassUrl falls back to the hard-coded helper endpoint', async () => {
        axiosFn.mockRejectedValueOnce(axiosError({ status: 403 }));
        bypassPost.mockResolvedValueOnce({ status: 200, data: 'ok', headers: {} });
        await fetchWithTimeout('https://api.example.com/x', { bypassUrl: 'relative-path' } as any, 0);
        expect(bypassPost).toHaveBeenCalledWith(
            'https://helper-thge.onrender.com/execute-request',
            expect.any(Object),
            expect.any(Object),
        );
    });
});

describe('timeout abort callback (real timers)', () => {
    test('the abort timer fires and a thrown abort is swallowed', async () => {
        jest.useFakeTimers();
        // Make axios hang until aborted; we simulate by never resolving but
        // letting the timeout fire. Force AbortController.abort to throw to
        // exercise the inner catch.
        const realAbort = AbortController.prototype.abort;
        AbortController.prototype.abort = function () {
            throw new Error('abort failed');
        };
        // axios rejects after the abort timer (it never resolves before).
        axiosFn.mockImplementation(
            () => new Promise((_, reject) => setTimeout(() => reject(axiosError({ code: 'ECONNABORTED' })), 100000)),
        );
        try {
            const p = fetchWithTimeout('https://api.example.com/x', { timeout: 1000 }, 0);
            // advance past the abort timeout (1000ms) -> abort() called -> throws -> caught
            await jest.advanceTimersByTimeAsync(1000);
            // advance to let the axios promise reject
            await jest.advanceTimersByTimeAsync(100000);
            const res = await p;
            expect(res).toBeUndefined();
        } finally {
            AbortController.prototype.abort = realAbort;
            jest.useRealTimers();
        }
    });
});

describe('parseError throwing branches', () => {
    test('when parseError throws, fetch falls back to a synthetic 500 and retries', async () => {
        const parseErrorModule = require('../parseError');
        const spy = jest
            .spyOn(parseErrorModule, 'parseError')
            .mockImplementationOnce(() => {
                throw new Error('parse boom');
            })
            // subsequent calls (final notification) behave normally
            .mockImplementation((e: any) => ({ status: 500, message: 'm', error: 'E' }));
        axiosFn.mockRejectedValue(axiosError({ status: 500 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined();
        spy.mockRestore();
    });

    test('final extract failure is caught (parseError throws on the last-error summary)', async () => {
        const parseErrorModule = require('../parseError');
        // first call (in-loop) returns a non-retryable status so we exit after 1 attempt;
        // second call (final summary) throws -> exercises the extractLastError catch.
        const spy = jest
            .spyOn(parseErrorModule, 'parseError')
            .mockImplementationOnce(() => ({ status: 404, message: 'm', error: 'E' }))
            .mockImplementationOnce(() => {
                throw new Error('final parse boom');
            });
        axiosFn.mockRejectedValueOnce(axiosError({ status: 404 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined();
        spy.mockRestore();
    });
});

describe('notification resilience', () => {
    test('a throwing notification sink does not break the request flow', async () => {
        getBots.mockImplementation(() => {
            throw new Error('no bots service');
        });
        axiosFn.mockRejectedValueOnce(axiosError({ status: 500 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined(); // still returns gracefully
    });

    test('a rejecting sendMessageByCategory is caught inside notifyInternal', async () => {
        // The bots service resolves but its send rejects → exercises the inner
        // try/catch around sendMessageByCategory (distinct from a missing sink).
        getBots.mockImplementation(() => ({ sendMessageByCategory }));
        sendMessageByCategory.mockRejectedValue(
            Object.assign(new Error('send failed'), { response: { data: 'sink down' } }),
        );
        axiosFn.mockRejectedValueOnce(axiosError({ status: 500 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined(); // request flow unaffected by notification failure
        expect(sendMessageByCategory).toHaveBeenCalled();
    });

    test('429 short-circuits the per-attempt notification (only the final summary sends)', async () => {
        axiosFn.mockRejectedValueOnce(axiosError({ status: 429 }));
        await fetchWithTimeout('https://api.example.com/x', {}, 0);
        // The per-attempt notifyInternal returns early on status 429 (no send for it).
        // The end-of-retries summary notification has no 429 status, so it sends once.
        expect(sendMessageByCategory).toHaveBeenCalledTimes(1);
        const [, text] = sendMessageByCategory.mock.calls[0];
        expect(text).toContain('retries exhausted');
    });
});

describe('notification message formatting branches', () => {
    test('ETIMEDOUT errors are reported as "Connection timed out"', async () => {
        getBots.mockImplementation(() => ({ sendMessageByCategory }));
        const parseErrorModule = require('../parseError');
        const spy = jest.spyOn(parseErrorModule, 'parseError')
            .mockImplementation(() => ({ status: 500, message: 'socket hang up ETIMEDOUT', error: 'E' }));
        axiosFn.mockRejectedValue(axiosError({ status: 500, message: 'ETIMEDOUT' }));
        await fetchWithTimeout('https://api.example.com/x', {}, 0);
        const sent = sendMessageByCategory.mock.calls.map(c => c[1]).join('\n');
        expect(sent).toContain('Connection timed out');
        spy.mockRestore();
    });

    test('ECONNREFUSED errors are reported as "Connection refused"', async () => {
        getBots.mockImplementation(() => ({ sendMessageByCategory }));
        const parseErrorModule = require('../parseError');
        const spy = jest.spyOn(parseErrorModule, 'parseError')
            .mockImplementation(() => ({ status: 500, message: 'connect ECONNREFUSED 127.0.0.1', error: 'E' }));
        axiosFn.mockRejectedValue(axiosError({ status: 500, message: 'ECONNREFUSED' }));
        await fetchWithTimeout('https://api.example.com/x', {}, 0);
        const sent = sendMessageByCategory.mock.calls.map(c => c[1]).join('\n');
        expect(sent).toContain('Connection refused');
        spy.mockRestore();
    });

    test('a non-string error message is JSON-stringified for the notification', async () => {
        // parseError yields an object message → the `typeof message === 'string'` false branch.
        getBots.mockImplementation(() => ({ sendMessageByCategory }));
        const parseErrorModule = require('../parseError');
        const spy = jest.spyOn(parseErrorModule, 'parseError')
            .mockImplementation(() => ({ status: 500, message: { reason: 'structured failure' }, error: 'E' }));
        axiosFn.mockRejectedValue(axiosError({ status: 500 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined();
        expect(sendMessageByCategory).toHaveBeenCalled(); // formatting didn't throw
        spy.mockRestore();
    });
});

describe('shouldRetry / notification-config branches', () => {
    test('a non-axios error with a non-retryable status is not retried', async () => {
        // isAxiosError=false drives shouldRetry's non-axios branch; status 400 is not retryable.
        axiosFn.isAxiosError.mockReturnValue(false);
        const parseErrorModule = require('../parseError');
        const spy = jest.spyOn(parseErrorModule, 'parseError')
            .mockImplementation(() => ({ status: 400, message: 'bad request', error: 'E' }));
        axiosFn.mockRejectedValue(new Error('plain non-axios error'));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 3);
        expect(res).toBeUndefined();
        expect(axiosFn).toHaveBeenCalledTimes(1); // not retried
        spy.mockRestore();
    });

    test('a thrown non-Error value is wrapped into an Error (lastError)', async () => {
        // axios rejecting with a non-Error string drives the `instanceof Error ? : new Error(...)` false branch.
        axiosFn.isAxiosError.mockReturnValue(false);
        axiosFn.mockRejectedValue('a plain string rejection');
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        expect(res).toBeUndefined();
    });

    test('a falsy bypass response does not short-circuit as success', async () => {
        // 403 triggers the bypass path; a falsy bypass result skips the `if (bypassResponse)` success branch.
        process.env.bypassURL = 'https://bypass.example.com/run';
        axiosFn.create.mockReturnValue({ post: jest.fn().mockResolvedValue(undefined) } as any);
        axiosFn.mockRejectedValue(axiosError({ status: 403 }));
        const res = await fetchWithTimeout('https://api.example.com/x', {}, 0);
        // No usable bypass response → overall failure (undefined), not a false success.
        expect(res).toBeUndefined();
    });

    test('notifications disabled via options.notificationConfig are skipped entirely', async () => {
        axiosFn.mockRejectedValue(axiosError({ status: 500 }));
        const res = await fetchWithTimeout(
            'https://api.example.com/x',
            { notificationConfig: { enabled: false } } as any,
            0,
        );
        expect(res).toBeUndefined();
        expect(sendMessageByCategory).not.toHaveBeenCalled(); // notifyInternal early-returns
    });
});
