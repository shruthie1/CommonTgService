import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ExceptionsFilter } from './Exception-filter';

function makeHost(): { host: ArgumentsHost; response: { status: jest.Mock; json: jest.Mock } } {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status, json };
    const host = {
        switchToHttp: () => ({
            getResponse: () => response,
            getRequest: () => ({}),
        }),
    } as unknown as ArgumentsHost;
    return { host, response };
}

describe('ExceptionsFilter', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('handles a generic Error with 500 default status', () => {
        const filter = new ExceptionsFilter();
        const { host, response } = makeHost();
        const err = new Error('boom');

        filter.catch(err, host);

        expect(response.status).toHaveBeenCalled();
        const statusArg = response.status.mock.calls[0][0];
        expect(statusArg).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        const jsonResult = response.status.mock.results[0].value;
        const payload = jsonResult.json.mock.calls[0][0];
        expect(payload.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(payload.message).toBeDefined();
    });

    it('handles an HttpException with string response', () => {
        const filter = new ExceptionsFilter();
        const { host, response } = makeHost();
        const err = new HttpException('forbidden text', HttpStatus.FORBIDDEN);

        filter.catch(err, host);

        const jsonResult = response.status.mock.results[0].value;
        const payload = jsonResult.json.mock.calls[0][0];
        expect(payload.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(payload.message).toBe('forbidden text');
    });

    it('handles an HttpException with object response carrying message', () => {
        const filter = new ExceptionsFilter();
        const { host, response } = makeHost();
        const err = new BadRequestException('validation failed');

        filter.catch(err, host);

        const jsonResult = response.status.mock.results[0].value;
        const payload = jsonResult.json.mock.calls[0][0];
        expect(payload.statusCode).toBe(HttpStatus.BAD_REQUEST);
        expect(payload.message).toBe('validation failed');
    });

    it('handles an HttpException with object response lacking message (falls back to object)', () => {
        const filter = new ExceptionsFilter();
        const { host, response } = makeHost();
        const err = new HttpException({ foo: 'bar' } as any, HttpStatus.CONFLICT);

        filter.catch(err, host);

        const jsonResult = response.status.mock.results[0].value;
        const payload = jsonResult.json.mock.calls[0][0];
        expect(payload.statusCode).toBe(HttpStatus.CONFLICT);
        expect(payload.message).toEqual({ foo: 'bar' });
    });

    it('handles exception without a stack property', () => {
        const filter = new ExceptionsFilter();
        const { host, response } = makeHost();

        filter.catch({ message: 'plain object error' }, host);

        expect(response.status).toHaveBeenCalled();
    });
});
