import { TelegramLogger } from '../telegram-logger';
import { Logger } from '../../../../utils';

describe('TelegramLogger', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;
    let verboseSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as any);
        errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined as any);
        warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as any);
        debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined as any);
        verboseSpy = jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined as any);
    });

    afterEach(() => jest.restoreAllMocks());

    test('info prefixes mobile and operation', () => {
        const tl = new TelegramLogger('Svc');
        tl.info('900', 'op', { a: 1 });
        expect(logSpy).toHaveBeenCalledWith('[900] op', { a: 1 });
    });

    test('error includes message and stack', () => {
        const tl = new TelegramLogger();
        const err = new Error('boom');
        tl.error('900', 'op', err);
        expect(errorSpy).toHaveBeenCalledWith('[900] op - boom', err.stack);
    });

    test('warn/debug/verbose/log delegate', () => {
        const tl = new TelegramLogger();
        tl.warn('900', 'w', { d: 1 });
        tl.debug('900', 'd');
        tl.verbose('900', 'v');
        tl.log('900', 'l');
        expect(warnSpy).toHaveBeenCalledWith('[900] w', { d: 1 });
        expect(debugSpy).toHaveBeenCalledWith('[900] d', undefined);
        expect(verboseSpy).toHaveBeenCalledWith('[900] v', undefined);
        expect(logSpy).toHaveBeenCalledWith('[900] l', undefined);
    });
});
