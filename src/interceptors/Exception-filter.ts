import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { parseError } from '../utils';

/**
 * The 2FA "Incorrect 2FA password (hint: …)" message carries the account owner's password hint.
 * It stays in the HTTP response (the signup UI shows it) but must never reach the logs.
 */
export function redactPasswordHint(text: string): string;
export function redactPasswordHint(text: string | undefined): string | undefined;
export function redactPasswordHint(text: string | undefined): string | undefined {
    return typeof text === 'string' ? text.replace(/\(hint: [^\n]*\)/g, '(hint: [redacted])') : text;
}

/** A log-only copy of the exception with the hint redacted; the original (and the response) is untouched. */
function redactForLog(exception: unknown): unknown {
    if (!(exception instanceof Error) || !/\(hint: /.test(exception.message)) return exception;
    const copy = Object.assign(Object.create(Object.getPrototypeOf(exception)), exception);
    copy.message = redactPasswordHint(exception.message);
    copy.stack = redactPasswordHint(exception.stack);
    if (exception instanceof HttpException) {
        const res = exception.getResponse();
        copy.response = typeof res === 'string' ? redactPasswordHint(res)
            : res && typeof (res as any).message === 'string' ? { ...res, message: redactPasswordHint((res as any).message) } : res;
    }
    return copy;
}

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        const loggable = redactForLog(exception);
        const errorDetails = parseError(loggable, 'Exception', false);
        console.error("stack:", loggable?.["stack"])

        // parseError always returns a non-zero default status and a non-empty
        // default message (see extractStatusCode/extractErrorMessage), so the
        // `||` fallbacks below are defense-in-depth that real input never hits.
        /* istanbul ignore next -- defensive: parseError guarantees a truthy status/message */
        let status = errorDetails.status || HttpStatus.INTERNAL_SERVER_ERROR;
        /* istanbul ignore next -- defensive: parseError guarantees a truthy status/message */
        let message = errorDetails.message || 'Internal server error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const errorResponse = exception.getResponse();
            message =
                typeof errorResponse === 'string'
                    ? errorResponse
                    : (errorResponse as any).message || errorResponse;
        }

        // If the response already started streaming (e.g. a timeout/error fired mid-stream on a
        // media download), we cannot set status/headers again — doing so throws "Cannot set
        // headers after they are sent" and corrupts the stream. Just terminate the connection.
        if (response.headersSent) {
            response.end();
            return;
        }

        response.status(status).json({
            statusCode: status,
            message,
            error: errorDetails.error
        });
    }
}
