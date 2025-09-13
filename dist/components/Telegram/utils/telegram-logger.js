"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramLogger = void 0;
const utils_1 = require("../../../utils");
class TelegramLogger {
    constructor(serviceName = 'TelegramService') {
        this.logger = new utils_1.Logger(serviceName);
    }
    info(mobile, operation, details) {
        this.logger.log(`[${mobile}] ${operation}`, details);
    }
    error(mobile, operation, error) {
        this.logger.error(`[${mobile}] ${operation} - ${error.message}`, error.stack);
    }
    warn(mobile, message, details) {
        this.logger.warn(`[${mobile}] ${message}`, details);
    }
    debug(mobile, message, details) {
        this.logger.debug(`[${mobile}] ${message}`, details);
    }
    verbose(mobile, message, details) {
        this.logger.verbose(`[${mobile}] ${message}`, details);
    }
    log(mobile, message, details) {
        this.logger.log(`[${mobile}] ${message}`, details);
    }
}
exports.TelegramLogger = TelegramLogger;
//# sourceMappingURL=telegram-logger.js.map