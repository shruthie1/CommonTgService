"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramLogger = void 0;
const utils_1 = require("../../../utils");
class TelegramLogger {
    constructor(serviceName = 'TelegramService') {
        this.logger = new utils_1.Logger(serviceName);
    }
    shouldIncludeDetails(details) {
        return details !== undefined
            && details !== null
            && !(typeof details === 'object' && Object.keys(details).length === 0);
    }
    formatMessage(mobile, message, details) {
        return this.shouldIncludeDetails(details)
            ? `[${mobile}] ${message} :: ${JSON.stringify(details)}`
            : `[${mobile}] ${message}`;
    }
    info(mobile, operation, details) {
        this.logger.log(this.formatMessage(mobile, operation, details));
    }
    error(mobile, operation, error) {
        this.logger.error(`[${mobile}] ${operation} - ${error.message}`, error.stack);
    }
    warn(mobile, message, details) {
        this.logger.warn(this.formatMessage(mobile, message, details));
    }
    debug(mobile, message, details) {
        this.logger.debug(this.formatMessage(mobile, message, details));
    }
}
exports.TelegramLogger = TelegramLogger;
//# sourceMappingURL=telegram-logger.js.map