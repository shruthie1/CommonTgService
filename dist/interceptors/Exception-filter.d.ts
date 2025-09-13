import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
export declare class ExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void;
}
