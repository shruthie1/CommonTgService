import { Logger } from "../../../utils";

export class TelegramLogger {
    private logger: Logger;

    constructor(serviceName: string = 'TelegramService') {
        this.logger = new Logger(serviceName);
    }

    info(mobile: string, operation: string, details?: any): void {
        this.logger.log(`[${mobile}] ${operation}`, details);
    }

    error(mobile: string, operation: string, error: any): void {
        this.logger.error(
            `[${mobile}] ${operation} - ${error.message}`,
            error.stack
        );
    }

    warn(mobile: string, message: string, details?: any): void {
        this.logger.warn(`[${mobile}] ${message}`, details);
    }

    debug(mobile: string, message: string, details?: any): void {
        this.logger.debug(`[${mobile}] ${message}`, details);
    }

    verbose(mobile: string, message: string, details?: any): void {
        this.logger.verbose(`[${mobile}] ${message}`, details);
    }

    log(mobile: string, message: string, details?: any): void {
        this.logger.log(`[${mobile}] ${message}`, details);
    }
}