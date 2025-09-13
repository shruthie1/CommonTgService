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
    log(message, data = '') {
        console.log(this.formatMessage('LOG', message, this.getLogColors(), data));
    }
    info(message, data = '') {
        console.log(this.formatMessage('INFO', message, this.getInfoColors(), data));
    }
    error(message, data = '', trace) {
        console.error(this.formatMessage('ERROR', message, this.getErrorColors(), data), trace ? '\n' + chalk_1.default.red.bold(trace) : '');
    }
    warn(message, data = '') {
        console.warn(this.formatMessage('WARN', message, this.getWarnColors(), data));
    }
    debug(message, data = '') {
        console.debug(this.formatMessage('DEBUG', message, this.getDebugColors(), data));
    }
    verbose(message, data = '') {
        console.debug(this.formatMessage('VERBOSE', message, this.getVerboseColors(), data));
    }
    success(message, data = '') {
        console.log(this.formatMessage('SUCCESS', message, this.getSuccessColors(), data));
    }
    getLogColors() {
        return {
            level: chalk_1.default.green,
            message: chalk_1.default.green.bold,
            context: chalk_1.default.cyan.bold,
        };
    }
    getInfoColors() {
        return {
            level: chalk_1.default.blue,
            message: chalk_1.default.blue.bold,
            context: chalk_1.default.blueBright.bold,
        };
    }
    getErrorColors() {
        return {
            level: chalk_1.default.red,
            message: chalk_1.default.red.bold,
            context: chalk_1.default.redBright.bold,
        };
    }
    getWarnColors() {
        return {
            level: chalk_1.default.yellow,
            message: chalk_1.default.yellow.bold,
            context: chalk_1.default.yellowBright.bold,
        };
    }
    getDebugColors() {
        return {
            level: chalk_1.default.magenta,
            message: chalk_1.default.magenta.bold,
            context: chalk_1.default.magentaBright.bold,
        };
    }
    getVerboseColors() {
        return {
            level: chalk_1.default.gray,
            message: chalk_1.default.gray.bold,
            context: chalk_1.default.white.dim,
        };
    }
    getSuccessColors() {
        return {
            level: chalk_1.default.greenBright,
            message: chalk_1.default.greenBright.bold,
            context: chalk_1.default.green.bold,
        };
    }
    formatMessage(level, message, colors, data) {
        const safeLevel = typeof level === 'string' && level.trim() !== '' ? level : 'UNKNOWN';
        const safeColors = {
            level: (colors?.level && typeof colors.level === 'function')
                ? colors.level
                : (txt) => txt,
            message: (colors?.message && typeof colors.message === 'function')
                ? colors.message
                : (txt) => txt,
        };
        const formattedMessage = message !== undefined && message !== null
            ? this.formatMultiColorMessage(message, safeColors.message)
            : safeColors.message('[EMPTY MESSAGE]');
        const serviceCtx = this.context ? chalk_1.default.yellow(`[${this.context}]`) : '';
        let extraCtx = '';
        if (typeof data === 'object') {
            try {
                extraCtx = this.formatObjectMessage(data);
            }
            catch {
                extraCtx = '[Invalid Context Object]';
            }
        }
        else if (typeof data === 'string') {
            extraCtx = this.parseColoredContext(data);
        }
        else {
            extraCtx = chalk_1.default.yellow.bold(String(data));
        }
        extraCtx = ' ' + extraCtx;
        const levelFormatted = safeColors.level(`[${safeLevel}]`);
        return `${levelFormatted} ${serviceCtx} ${formattedMessage}${extraCtx}`;
    }
    formatMultiColorMessage(message, levelColor) {
        if (typeof message === 'object') {
            return '\n' + this.formatObjectMessage(message);
        }
        let formatted = String(message);
        formatted = formatted.replace(/\[([^\]]+)\]/g, chalk_1.default.cyan.bold('[$1]'));
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, chalk_1.default.white.bold('$1'));
        formatted = formatted.replace(/\*([^*]+)\*/g, chalk_1.default.yellow('$1'));
        formatted = formatted.replace(/_([^_]+)_/g, chalk_1.default.underline('$1'));
        return levelColor(formatted);
    }
    formatObjectMessage(obj, indent = 2) {
        if (Array.isArray(obj)) {
            return '[\n' + obj.map((el) => ' '.repeat(indent) + this.formatObjectMessage(el, indent + 2)).join(',\n') + '\n]';
        }
        if (obj && typeof obj === 'object') {
            const entries = Object.entries(obj).map(([key, value]) => {
                const coloredKey = chalk_1.default.cyan(`"${key}"`) + chalk_1.default.white(': ');
                const formattedValue = this.formatObjectMessage(value, indent + 2);
                return ' '.repeat(indent) + coloredKey + formattedValue;
            });
            return '{\n' + entries.join(',\n') + '\n' + ' '.repeat(indent - 2) + '}';
        }
        if (typeof obj === 'string')
            return chalk_1.default.blueBright.bold(`"${obj}"`);
        if (typeof obj === 'number')
            return chalk_1.default.yellow.bold(obj);
        if (typeof obj === 'boolean')
            return chalk_1.default.magenta.bold(obj);
        if (obj === null)
            return chalk_1.default.gray.bold('null');
        return chalk_1.default.cyanBright.bold(String(obj));
    }
    parseColoredContext(context) {
        if (/^\d+$/.test(context)) {
            return chalk_1.default.magentaBright.bold(context);
        }
        if (context === context.toUpperCase()) {
            return chalk_1.default.cyanBright.bold(context);
        }
        const colorPattern = /\{(\w+):([^}]+)\}/g;
        return context.replace(colorPattern, (match, colorName, text) => {
            const chalkColor = this.getChalkColor(colorName);
            return chalkColor ? chalkColor(text) : chalk_1.default.cyanBright.bold(text);
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