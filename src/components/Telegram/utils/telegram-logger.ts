import { Logger } from '@nestjs/common';

export class TelegramLogger {
    private static instance: TelegramLogger;
    private logger: Logger;

    constructor(serviceName:string = 'TelegramService') {
        this.logger = new Logger(serviceName);
    }

    private shouldIncludeDetails(details?: any): boolean {
        return details !== undefined
            && details !== null
            && !(typeof details === 'object' && Object.keys(details).length === 0);
    }

    private formatMessage(mobile: string, message: string, details?: any): string {
        return this.shouldIncludeDetails(details)
            ? `[${mobile}] ${message} :: ${JSON.stringify(details)}`
            : `[${mobile}] ${message}`;
    }

    info(mobile: string, operation: string, details?: any): void {
        this.logger.log(this.formatMessage(mobile, operation, details));
    }

    error(mobile: string, operation: string, error: any): void {
        this.logger.error(
            `[${mobile}] ${operation} - ${error.message}`,
            error.stack
        );
    }

    warn(mobile: string, message: string, details?: any): void {
        this.logger.warn(this.formatMessage(mobile, message, details));
    }

    debug(mobile: string, message: string, details?: any): void {
        this.logger.debug(this.formatMessage(mobile, message, details));
    }
}