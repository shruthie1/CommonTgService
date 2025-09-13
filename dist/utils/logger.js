"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const common_1 = require("@nestjs/common");
const chalk_1 = __importDefault(require("chalk"));
class Logger extends common_1.Logger {
    log(message, context) {
        console.log(this.formatMessage('LOG', message, chalk_1.default.green, context));
    }
    info(message, context) {
        console.log(this.formatMessage('INFO', message, chalk_1.default.white, context));
    }
    error(message, context, trace) {
        console.error(this.formatMessage('ERROR', message, chalk_1.default.red, context), trace ? chalk_1.default.red(trace) : '');
    }
    warn(message, context) {
        console.warn(this.formatMessage('WARN', message, chalk_1.default.yellow, context));
    }
    debug(message, context) {
        console.debug(this.formatMessage('DEBUG', message, chalk_1.default.cyan, context));
    }
    verbose(message, context) {
        console.debug(this.formatMessage('VERBOSE', message, chalk_1.default.gray, context));
    }
    formatMessage(level, message, levelColor, context) {
        const msg = typeof message === 'object'
            ? JSON.stringify(message, null, 2)
            : String(message);
        const ctx = context !== undefined
            ? chalk_1.default.magenta(`[${typeof context === 'object'
                ? JSON.stringify(context, null, 2)
                : context}]`)
            : '';
        return `${levelColor(`[${level}]`)}${ctx ? ' ' + ctx : ''} ${chalk_1.default.green(msg)}`;
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map