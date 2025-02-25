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
    logOperation(mobile, operation, details) {
        this.logger.log(`[${mobile}] ${operation} - ${JSON.stringify(details || {})}`);
    }
    logError(mobile, operation, error) {
        this.logger.error(`[${mobile}] ${operation} failed - ${error.message}`, error.stack);
    }
    logWarning(mobile, message, details) {
        this.logger.warn(`[${mobile}] ${message} - ${JSON.stringify(details || {})}`);
    }
    logDebug(mobile, message, details) {
        this.logger.debug(`[${mobile}] ${message} - ${JSON.stringify(details || {})}`);
    }
}
exports.TelegramLogger = TelegramLogger;
//# sourceMappingURL=telegram-logger.js.map