"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramLogger = void 0;
const common_1 = require("@nestjs/common");
class TelegramLogger {
    constructor() {
        this.logger = new common_1.Logger('TelegramService');
    }
    static getInstance() {
        if (!TelegramLogger.instance) {
            TelegramLogger.instance = new TelegramLogger();
        }
        return TelegramLogger.instance;
    }
    shouldIncludeDetails(details) {
        return details !== undefined
            && details !== null
            && !(typeof details === 'object' && Object.keys(details).length === 0);
    }
    formatMessage(mobile, message, details) {
        return this.shouldIncludeDetails(details)
            ? `[${mobile}] ${message} - ${JSON.stringify(details)}`
            : `[${mobile}] ${message}`;
    }
    logOperation(mobile, operation, details) {
        this.logger.log(this.formatMessage(mobile, operation, details));
    }
    logError(mobile, operation, error) {
        this.logger.error(`[${mobile}] ${operation} failed - ${error.message}`, error.stack);
    }
    logWarning(mobile, message, details) {
        this.logger.warn(this.formatMessage(mobile, message, details));
    }
    logDebug(mobile, message, details) {
        this.logger.debug(this.formatMessage(mobile, message, details));
    }
}
exports.TelegramLogger = TelegramLogger;
//# sourceMappingURL=telegram-logger.js.map