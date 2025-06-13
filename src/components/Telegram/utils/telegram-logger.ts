import { Logger } from '@nestjs/common';

export class TelegramLogger {
    private static instance: TelegramLogger;
    private logger: Logger;

    private constructor() {
        this.logger = new Logger('TelegramService');
    }

    static getInstance(): TelegramLogger {
        if (!TelegramLogger.instance) {
            TelegramLogger.instance = new TelegramLogger();
        }
        return TelegramLogger.instance;
    }

    private shouldIncludeDetails(details?: any): boolean {
        return details !== undefined 
            && details !== null 
            && !(typeof details === 'object' && Object.keys(details).length === 0);
    }

    private formatMessage(mobile: string, message: string, details?: any): string {
        return this.shouldIncludeDetails(details)
            ? `[${mobile}] ${message} - ${JSON.stringify(details)}`
            : `[${mobile}] ${message}`;
    }

    logOperation(mobile: string, operation: string, details?: any): void {
        this.logger.log(this.formatMessage(mobile, operation, details));
    }

    logError(mobile: string, operation: string, error: any): void {
        this.logger.error(
            `[${mobile}] ${operation} failed - ${error.message}`,
            error.stack
        );
    }

    logWarning(mobile: string, message: string, details?: any): void {
        this.logger.warn(this.formatMessage(mobile, message, details));
    }

    logDebug(mobile: string, message: string, details?: any): void {
        this.logger.debug(this.formatMessage(mobile, message, details));
    }
}