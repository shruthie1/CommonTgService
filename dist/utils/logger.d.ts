import { Logger as NestLogger } from '@nestjs/common';
export declare class Logger extends NestLogger {
    log(message: any, context?: any): void;
    info(message: any, context?: any): void;
    error(message: any, context?: any, trace?: any): void;
    warn(message: any, context?: any): void;
    debug(message: any, context?: any): void;
    verbose(message: any, context?: any): void;
    private formatMessage;
}
