import { withTimeout } from '../withTimeout';

// Mock telegram's sleep so retry backoff resolves instantly (no real delay).
jest.mock('telegram/Helpers', () => ({
  sleep: jest.fn(() => Promise.resolve()),
}));

describe('withTimeout', () => {
  test('resolves with the value when the task completes in time', async () => {
    const result = await withTimeout(() => Promise.resolve('ok'), { timeout: 1000 });
    expect(result).toBe('ok');
  });

  test('rejects with a timeout error when the task exceeds the timeout', async () => {
    await expect(
      withTimeout(() => new Promise((res) => setTimeout(() => res('late'), 50)), {
        timeout: 5,
        maxRetries: 1,
      }),
    ).rejects.toThrow(/Operation timeout/);
  });

  test('returns undefined instead of throwing when throwErr is false', async () => {
    const result = await withTimeout(() => Promise.reject(new Error('boom')), {
      throwErr: false,
      maxRetries: 1,
      shouldRetry: () => false,
    });
    expect(result).toBeUndefined();
  });

  test('retries on retryable errors then succeeds', async () => {
    let calls = 0;
    const factory = jest.fn(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('network failure'));
      return Promise.resolve('done');
    });
    const result = await withTimeout(factory, {
      maxRetries: 5,
      shouldRetry: () => true,
      timeout: 1000,
    });
    expect(result).toBe('done');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  test('stops retrying when shouldRetry returns false', async () => {
    const factory = jest.fn(() => Promise.reject(new Error('fatal')));
    await expect(
      withTimeout(factory, { maxRetries: 5, shouldRetry: () => false }),
    ).rejects.toThrow('fatal');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  test('stops at maxRetries even when shouldRetry is true', async () => {
    const factory = jest.fn(() => Promise.reject(new Error('network')));
    await expect(
      withTimeout(factory, { maxRetries: 3, shouldRetry: () => true }),
    ).rejects.toThrow('network');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  test('default shouldRetry honors maxRetries beyond 3 for a recoverable error', async () => {
    // Real scenario: a flaky-but-recoverable network failure during warmup/2FA with
    // maxRetries:6. The DEFAULT shouldRetry must not silently cap retries at 3 — giving up
    // early can make the caller mark a healthy account dead and trigger an unnecessary swap.
    const factory = jest.fn(() => Promise.reject(new Error('network failure')));
    await expect(
      withTimeout(factory, { maxRetries: 6, baseDelay: 1, maxDelay: 2 }),
    ).rejects.toThrow('network failure');
    expect(factory).toHaveBeenCalledTimes(6);
  });

  test('default shouldRetry still does NOT retry a non-recoverable error', async () => {
    const factory = jest.fn(() => Promise.reject(new Error('FORBIDDEN')));
    await expect(
      withTimeout(factory, { maxRetries: 6, baseDelay: 1, maxDelay: 2 }),
    ).rejects.toThrow('FORBIDDEN');
    expect(factory).toHaveBeenCalledTimes(1); // not retryable -> single attempt
  });

  test('honors an already-aborted cancel signal before running', async () => {
    const controller = new AbortController();
    controller.abort();
    const factory = jest.fn(() => Promise.resolve('never'));
    await expect(
      withTimeout(factory, { cancelSignal: controller.signal, throwErr: true }),
    ).rejects.toThrow('Operation cancelled');
    expect(factory).not.toHaveBeenCalled();
  });

  test('rejects synchronously when signal is aborted as runWithTimeout starts', async () => {
    // The loop guard reads `aborted` first (false), then runWithTimeout reads it
    // again inside the Promise executor (true), hitting the early-reject branch.
    let reads = 0;
    const signal = {
      get aborted() {
        reads++;
        return reads > 1; // false on the first read, true afterwards
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as AbortSignal;

    const factory = jest.fn(() => Promise.resolve('value'));
    await expect(
      withTimeout(factory, { cancelSignal: signal, timeout: 5000, maxRetries: 1 }),
    ).rejects.toThrow('Operation cancelled');
  });

  test('rejects when the signal aborts during execution', async () => {
    const controller = new AbortController();
    const promise = withTimeout(
      () => new Promise((res) => setTimeout(() => res('late'), 1000)),
      { cancelSignal: controller.signal, timeout: 5000, maxRetries: 1 },
    );
    setTimeout(() => controller.abort(), 5);
    await expect(promise).rejects.toThrow('Operation cancelled');
  });

  test('invokes onTimeout callback before final rejection', async () => {
    const onTimeout = jest.fn(() => Promise.resolve());
    await expect(
      withTimeout(() => Promise.reject(new Error('fail')), {
        maxRetries: 1,
        shouldRetry: () => false,
        onTimeout,
      }),
    ).rejects.toThrow('fail');
    expect(onTimeout).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  test('swallows errors thrown by the onTimeout callback', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onTimeout = jest.fn(() => Promise.reject(new Error('cb failed')));
    await expect(
      withTimeout(() => Promise.reject(new Error('fail')), {
        maxRetries: 1,
        shouldRetry: () => false,
        onTimeout,
        throwErr: false,
      }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('onTimeout callback failed:', expect.any(Error));
    errSpy.mockRestore();
  });

  describe('defaultShouldRetry behavior (via real default)', () => {
    test('retries on timeout/network/connection messages and known codes', async () => {
      for (const msg of ['timeout occurred', 'network down', 'connection lost']) {
        const factory = jest.fn()
          .mockRejectedValueOnce(new Error(msg))
          .mockResolvedValueOnce('ok');
        const result = await withTimeout(factory, { maxRetries: 3, timeout: 1000 });
        expect(result).toBe('ok');
        expect(factory).toHaveBeenCalledTimes(2);
      }
    });

    test('retries on ECONNRESET error code', async () => {
      const err: any = new Error('reset'); err.code = 'ECONNRESET';
      const factory = jest.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce('ok');
      const result = await withTimeout(factory, { maxRetries: 3, timeout: 1000 });
      expect(result).toBe('ok');
    });

    test('does not retry on a cancelled error message', async () => {
      const factory = jest.fn(() => Promise.reject(new Error('Operation cancelled')));
      await expect(withTimeout(factory, { maxRetries: 3 })).rejects.toThrow('cancelled');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    test('does not retry on a non-retryable error', async () => {
      const factory = jest.fn(() => Promise.reject(new Error('validation error')));
      await expect(withTimeout(factory, { maxRetries: 3 })).rejects.toThrow('validation');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    test('default retry honors maxRetries (no hidden cap) for a recoverable error', async () => {
      const factory = jest.fn(() => Promise.reject(new Error('network')));
      await expect(
        withTimeout(factory, { maxRetries: 10, baseDelay: 1, maxDelay: 2 }),
      ).rejects.toThrow('network');
      // The retry count is bounded by maxRetries, not a hard-coded cap inside defaultShouldRetry.
      expect(factory).toHaveBeenCalledTimes(10);
    });
  });
});
