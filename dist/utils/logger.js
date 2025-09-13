"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const common_1 = require("@nestjs/common");
const chalk_1 = __importDefault(require("chalk"));
class Logger extends common_1.Logger {
    constructor(context) {
        super(context);
        chalk_1.default.level = 3;
    }
    log(message, context) {
        console.log(this.formatMessage('LOG', message, this.getLogColors(), context));
    }
    info(message, context) {
        console.log(this.formatMessage('INFO', message, this.getInfoColors(), context));
    }
    error(message, context, trace) {
        console.error(this.formatMessage('ERROR', message, this.getErrorColors(), context), trace ? '\n' + chalk_1.default.red.bold(trace) : '');
    }
    warn(message, context) {
        console.warn(this.formatMessage('WARN', message, this.getWarnColors(), context));
    }
    debug(message, context) {
        console.debug(this.formatMessage('DEBUG', message, this.getDebugColors(), context));
    }
    verbose(message, context) {
        console.debug(this.formatMessage('VERBOSE', message, this.getVerboseColors(), context));
    }
    success(message, context) {
        console.log(this.formatMessage('SUCCESS', message, this.getSuccessColors(), context));
    }
    getLogColors() {
        return {
            level: chalk_1.default.green,
            message: chalk_1.default.green.bold,
            context: chalk_1.default.cyan.bold,
            timestamp: chalk_1.default.gray,
        };
    }
    getInfoColors() {
        return {
            level: chalk_1.default.blue,
            message: chalk_1.default.blue.bold,
            context: chalk_1.default.blueBright.bold,
            timestamp: chalk_1.default.gray,
        };
    }
    getErrorColors() {
        return {
            level: chalk_1.default.red,
            message: chalk_1.default.red.bold,
            context: chalk_1.default.redBright.bold,
            timestamp: chalk_1.default.gray,
        };
    }
    getWarnColors() {
        return {
            level: chalk_1.default.yellow,
            message: chalk_1.default.yellow.bold,
            context: chalk_1.default.yellowBright.bold,
            timestamp: chalk_1.default.gray,
        };
    }
    getDebugColors() {
        return {
            level: chalk_1.default.magenta,
            message: chalk_1.default.magenta.bold,
            context: chalk_1.default.magentaBright.bold,
            timestamp: chalk_1.default.gray,
        };
    }
    getVerboseColors() {
        return {
            level: chalk_1.default.gray,
            message: chalk_1.default.gray.bold,
            context: chalk_1.default.white.dim,
            timestamp: chalk_1.default.gray.dim,
        };
    }
    getSuccessColors() {
        return {
            level: chalk_1.default.greenBright,
            message: chalk_1.default.greenBright.bold,
            context: chalk_1.default.green.bold,
            timestamp: chalk_1.default.gray,
        };
    }
    formatMessage(level, message, colors, context) {
        const formattedMessage = this.formatMultiColorMessage(message, colors.message);
        const ctx = context !== undefined
            ? `[${typeof context === 'object'
                ? this.formatObjectMessage(context)
                : this.parseColoredContext(context)}]`
            : '';
        const levelFormatted = colors.level(`[${level}]`);
        return `${levelFormatted}${ctx ? ' ' + ctx : ''} ${formattedMessage}`;
    }
    formatMultiColorMessage(message, levelColor) {
        if (typeof message === 'object') {
            return this.formatObjectMessage(message);
        }
        let formatted = String(message);
        formatted = formatted.replace(/\[([^\]]+)\]/g, chalk_1.default.cyan.bold('[$1]'));
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, chalk_1.default.white.bold('$1'));
        formatted = formatted.replace(/\*([^*]+)\*/g, chalk_1.default.yellow('$1'));
        formatted = formatted.replace(/_([^_]+)_/g, chalk_1.default.underline('$1'));
        return levelColor(formatted);
    }
    formatObjectMessage(obj) {
        const jsonStr = JSON.stringify(obj, null, 2);
        return jsonStr
            .replace(/"([^"]+)":/g, chalk_1.default.cyan('"$1"') + chalk_1.default.white(':'))
            .replace(/: "([^"]+)"/g, ': ' + chalk_1.default.green('"$1"'))
            .replace(/: (\d+)/g, ': ' + chalk_1.default.yellow('$1'))
            .replace(/: (true|false)/g, ': ' + chalk_1.default.magenta('$1'))
            .replace(/: null/g, ': ' + chalk_1.default.gray('null'));
    }
    parseColoredContext(context) {
        const colorPattern = /\{(\w+):([^}]+)\}/g;
        return context.replace(colorPattern, (match, colorName, text) => {
            const chalkColor = this.getChalkColor(colorName);
            return chalkColor ? chalkColor(text) : text;
        });
    }
    getChalkColor(colorName) {
        const colorMap = {
            red: chalk_1.default.red,
            green: chalk_1.default.green,
            blue: chalk_1.default.blue,
            yellow: chalk_1.default.yellow,
            magenta: chalk_1.default.magenta,
            cyan: chalk_1.default.cyan,
            white: chalk_1.default.white,
            gray: chalk_1.default.gray,
            grey: chalk_1.default.gray,
            black: chalk_1.default.black,
            redBright: chalk_1.default.redBright,
            greenBright: chalk_1.default.greenBright,
            blueBright: chalk_1.default.blueBright,
            yellowBright: chalk_1.default.yellowBright,
            magentaBright: chalk_1.default.magentaBright,
            cyanBright: chalk_1.default.cyanBright,
            whiteBright: chalk_1.default.whiteBright,
            bold: chalk_1.default.bold,
            dim: chalk_1.default.dim,
            underline: chalk_1.default.underline,
            inverse: chalk_1.default.inverse,
        };
        return colorMap[colorName];
    }
    static log(message, context) {
        new Logger(context).log(message, context);
    }
    static error(message, trace, context) {
        new Logger(context).error(message, context, trace);
    }
    static warn(message, context) {
        new Logger(context).warn(message, context);
    }
    static debug(message, context) {
        new Logger(context).debug(message, context);
    }
    static verbose(message, context) {
        new Logger(context).verbose(message, context);
    }
    static success(message, context) {
        new Logger(context).success(message, context);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map