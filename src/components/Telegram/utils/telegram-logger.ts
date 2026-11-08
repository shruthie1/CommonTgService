import { Logger } from "../../../utils/logger";
import { maskMobile } from "../../monitor/monitor-util";

/** The first argument is usually a phone number; tags like 'system' or 'Default' are printed as-is. */
function tag(mobile: string): string {
    return typeof mobile === 'string' && /^\+?\d{5,}$/.test(mobile) ? maskMobile(mobile) : mobile;
}

export class TelegramLogger {
    private logger: Logger;

    constructor(serviceName: string = 'TelegramService') {
        this.logger = new Logger(serviceName);
    }

    info(mobile: string, operation: string, details?: any): void {
        this.logger.log(`[${tag(mobile)}] ${operation}`, details);
    }

    error(mobile: string, operation: string, error: any): void {
        this.logger.error(
            `[${tag(mobile)}] ${operation} - ${error.message}`,
            error.stack
        );
    }

    warn(mobile: string, message: string, details?: any): void {
        this.logger.warn(`[${tag(mobile)}] ${message}`, details);
    }

    debug(mobile: string, message: string, details?: any): void {
        this.logger.debug(`[${tag(mobile)}] ${message}`, details);
    }

    verbose(mobile: string, message: string, details?: any): void {
        this.logger.verbose(`[${tag(mobile)}] ${message}`, details);
    }

    log(mobile: string, message: string, details?: any): void {
        this.logger.log(`[${tag(mobile)}] ${message}`, details);
    }
}
