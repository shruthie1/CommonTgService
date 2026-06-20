import { Logger } from '../logger';

describe('Logger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('constructor', () => {
    it('extracts basename without extension from a file path context', () => {
      const l = new Logger('/some/dir/MyModule.service.ts');
      expect((l as any).context).toBe('MyModule.service');
    });

    it('handles undefined context', () => {
      const l = new Logger();
      l.log('hello');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('handles non-string context without throwing', () => {
      // path.basename will throw on non-string -> caught -> fallback "Unknown"
      const l = new Logger(123 as any);
      // catch block sets localContext = "Unknown" but super() is called inside try only on string,
      // here super is called with the (failed) localContext value; just assert no throw + usable
      expect(() => l.log('x')).not.toThrow();
    });
  });

  describe('instance level methods', () => {
    it('log writes to stdout', () => {
      new Logger('Ctx').log('a log message');
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('LOG');
      expect(out).toContain('a log message');
    });

    it('info writes to stdout', () => {
      new Logger('Ctx').info('an info');
      expect((stdoutSpy.mock.calls[0][0] as string)).toContain('INFO');
    });

    it('error writes to stderr with trace', () => {
      new Logger('Ctx').error('an error', '', 'TRACE-LINE');
      const out = stderrSpy.mock.calls[0][0] as string;
      expect(out).toContain('ERROR');
      expect(out).toContain('TRACE-LINE');
    });

    it('error writes to stderr without trace', () => {
      new Logger('Ctx').error('an error');
      expect((stderrSpy.mock.calls[0][0] as string)).toContain('ERROR');
    });

    it('warn writes to stdout', () => {
      new Logger('Ctx').warn('a warn');
      expect((stdoutSpy.mock.calls[0][0] as string)).toContain('WARN');
    });

    it('debug writes to stdout', () => {
      new Logger('Ctx').debug('a debug');
      expect((stdoutSpy.mock.calls[0][0] as string)).toContain('DEBUG');
    });

    it('verbose writes to stdout', () => {
      new Logger('Ctx').verbose('a verbose');
      expect((stdoutSpy.mock.calls[0][0] as string)).toContain('VERBOSE');
    });

    it('success writes to stdout', () => {
      new Logger('Ctx').success('a success');
      expect((stdoutSpy.mock.calls[0][0] as string)).toContain('SUCCESS');
    });
  });

  describe('formatting branches', () => {
    it('formats object message', () => {
      new Logger('Ctx').log({ a: 1, b: 'two', c: true, d: null });
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('"a"');
      expect(out).toContain('"two"');
    });

    it('formats nested arrays and objects', () => {
      new Logger('Ctx').log({ list: [1, 2, { nested: 'x' }] });
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('list');
    });

    it('handles circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      new Logger('Ctx').log(obj);
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('[Circular]');
    });

    it('formats markdown-like tokens [x], **bold**, *italic*', () => {
      new Logger('Ctx').log('start [TAG] **bold** *italic* end');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('handles object data context', () => {
      new Logger('Ctx').log('msg', { extra: 'data' });
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('extra');
    });

    it('handles string numeric data context', () => {
      new Logger('Ctx').log('msg', '12345');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('handles uppercase string data context', () => {
      new Logger('Ctx').log('msg', 'UPPERCASE');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('handles mixed-case string data context', () => {
      new Logger('Ctx').log('msg', 'MixedCase');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('handles non-string non-object data context (number)', () => {
      new Logger('Ctx').log('msg', 42 as any);
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('handles null message -> EMPTY MESSAGE', () => {
      new Logger('Ctx').log(null);
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('EMPTY MESSAGE');
    });

    it('handles undefined message -> EMPTY MESSAGE', () => {
      new Logger('Ctx').log(undefined);
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('EMPTY MESSAGE');
    });

    it('logger with no context omits service ctx', () => {
      new Logger().log('no-ctx');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('formats primitive object values: number and boolean leaf nodes', () => {
      new Logger('Ctx').log({ n: 5, b: false });
      const out = stdoutSpy.mock.calls[0][0] as string;
      expect(out).toContain('"n"');
      expect(out).toContain('"b"');
    });

    it('formats fallback leaf value (undefined / bigint)', () => {
      new Logger('Ctx').log({ u: undefined, big: BigInt(7) });
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('formatMessage handles a data object that throws during serialization', () => {
      const l = new Logger('Ctx');
      const throwing: any = {};
      Object.defineProperty(throwing, 'bad', {
        enumerable: true,
        get() {
          throw new Error('explode');
        },
      });
      // direct private call to hit the catch branch in formatMessage's data block
      const out = (l as any).formatMessage('m', 'msg', (l as any).getLogColors(), throwing);
      expect(out).toContain('Invalid Context Object');
    });

    it('formatMessage falls back when color functions are not provided', () => {
      const l = new Logger('Ctx');
      const out = (l as any).formatMessage('LVL', 'plain', {} as any, '');
      expect(out).toContain('plain');
    });
  });

  describe('static methods', () => {
    it('static log', () => {
      Logger.log('static log', 'StaticCtx');
      expect(stdoutSpy).toHaveBeenCalled();
    });
    it('static error', () => {
      Logger.error('static error', 'trace', 'StaticCtx');
      expect(stderrSpy).toHaveBeenCalled();
    });
    it('static warn', () => {
      Logger.warn('static warn', 'StaticCtx');
      expect(stdoutSpy).toHaveBeenCalled();
    });
    it('static debug', () => {
      Logger.debug('static debug', 'StaticCtx');
      expect(stdoutSpy).toHaveBeenCalled();
    });
    it('static verbose', () => {
      Logger.verbose('static verbose', 'StaticCtx');
      expect(stdoutSpy).toHaveBeenCalled();
    });
    it('static success', () => {
      Logger.success('static success', 'StaticCtx');
      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('overrideConsole', () => {
    const orig = {
      log: console.log,
      info: console.info,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };
    afterEach(() => {
      console.log = orig.log;
      console.info = orig.info;
      console.error = orig.error;
      console.warn = orig.warn;
      console.debug = orig.debug;
    });

    it('overrides console methods and routes through Logger', () => {
      Logger.overrideConsole('Console');
      console.log('via console.log');
      console.info('via console.info');
      console.error('via console.error');
      console.warn('via console.warn');
      console.debug('via console.debug');
      (console as any).success('via console.success');
      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalled();
    });
  });
});
