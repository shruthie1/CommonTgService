import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { parseError } from '../utils';

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        const errorDetails = parseError(exception, 'Exception', false);
        console.error("stack:", exception["stack"])

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

        response.status(status).json({
            statusCode: status,
            message,
            error: errorDetails.error
        });
    }
}
