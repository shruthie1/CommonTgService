import { setProcessListeners } from '../processListeners';

describe('setProcessListeners', () => {
  const signals = [
    'unhandledRejection',
    'uncaughtException',
    'SIGINT',
    'SIGTERM',
    'SIGQUIT',
    'exit',
  ];
  // snapshot the listeners that exist before our test attaches any
  let preexisting: Record<string, ((...args: any[]) => void)[]> = {};
  let exitSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    preexisting = {};
    signals.forEach((s) => {
      preexisting[s] = process.listeners(s as any).slice();
    });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((() => undefined) as any));
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // remove only the listeners we added during the test
    signals.forEach((s) => {
      process.listeners(s as any).forEach((l) => {
        if (!preexisting[s].includes(l)) {
          process.removeListener(s as any, l as any);
        }
      });
    });
    exitSpy.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('registers listeners and logs setup', () => {
    setProcessListeners();
    expect(logSpy).toHaveBeenCalledWith('✅ Process listeners set up successfully');
    signals.forEach((s) => {
      expect(process.listeners(s as any).length).toBeGreaterThan(preexisting[s].length);
    });
  });

  it('unhandledRejection logs error', () => {
    setProcessListeners();
    const reason = new Error('rejected');
    process.emit('unhandledRejection' as any, reason, Promise.resolve());
    expect(errSpy).toHaveBeenCalledWith(
      '❌ Unhandled Rejection at:',
      expect.anything(),
      'reason:',
      reason,
    );
  });

  it('uncaughtException logs and exits with code 1 (uses error.stack)', () => {
    setProcessListeners();
    const error = new Error('boom');
    process.emit('uncaughtException' as any, error);
    expect(errSpy).toHaveBeenCalledWith('❌ Uncaught Exception:', error.stack);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uncaughtException without stack logs the error object itself', () => {
    setProcessListeners();
    const error: any = { message: 'no stack' };
    process.emit('uncaughtException' as any, error);
    expect(errSpy).toHaveBeenCalledWith('❌ Uncaught Exception:', error);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('SIGINT triggers graceful shutdown exit(0)', () => {
    setProcessListeners();
    process.emit('SIGINT' as any);
    expect(logSpy).toHaveBeenCalledWith('⚡ SIGINT received, shutting down...');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('SIGTERM triggers graceful shutdown', () => {
    setProcessListeners();
    process.emit('SIGTERM' as any);
    expect(logSpy).toHaveBeenCalledWith('⚡ SIGTERM received, shutting down...');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('SIGQUIT triggers graceful shutdown', () => {
    setProcessListeners();
    process.emit('SIGQUIT' as any);
    expect(logSpy).toHaveBeenCalledWith('⚡ SIGQUIT received, shutting down...');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('second signal is ignored once shutting down (isShuttingDown guard)', () => {
    setProcessListeners();
    process.emit('SIGINT' as any);
    const exitCallsAfterFirst = exitSpy.mock.calls.length;
    process.emit('SIGTERM' as any);
    // no new exit call because isShuttingDown is true
    expect(exitSpy.mock.calls.length).toBe(exitCallsAfterFirst);
  });

  it('exit handler logs exit code', () => {
    setProcessListeners();
    process.emit('exit' as any, 0);
    expect(logSpy).toHaveBeenCalledWith('🛑 Application closed with exit code 0');
  });
});
