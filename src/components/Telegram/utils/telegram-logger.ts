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

    logOperation(mobile: string, operation: string, details?: any): void {
        this.logger.log(`[${mobile}] ${operation} - ${JSON.stringify(details || {})}`);
    }

    logError(mobile: string, operation: string, error: any): void {
        this.logger.error(
            `[${mobile}] ${operation} failed - ${error.message}`,
            error.stack
        );
    }

    logWarning(mobile: string, message: string, details?: any): void {
        this.logger.warn(`[${mobile}] ${message} - ${JSON.stringify(details || {})}`);
    }

    logDebug(mobile: string, message: string, details?: any): void {
        this.logger.debug(`[${mobile}] ${message} - ${JSON.stringify(details || {})}`);
    }
}