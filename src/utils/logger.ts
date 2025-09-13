import { Logger as NestLogger } from '@nestjs/common';
import chalk from 'chalk';

export class Logger extends NestLogger {
    constructor(context?: string) {
        super(context);
        chalk.level = 3; // force colors
    }

    log(message: any, data: any = '') {
        console.log(this.formatMessage('LOG', message, this.getLogColors(), data));
    }

    info(message: any, data: any = '') {
        console.log(this.formatMessage('INFO', message, this.getInfoColors(), data));
    }

    error(message: any, data: any = '', trace?: any) {
        console.error(
            this.formatMessage('ERROR', message, this.getErrorColors(), data),
            trace ? '\n' + chalk.red.bold(trace) : '',
        );
    }

    warn(message: any, data: any = '') {
        console.warn(this.formatMessage('WARN', message, this.getWarnColors(), data));
    }

    debug(message: any, data: any = '') {
        console.debug(this.formatMessage('DEBUG', message, this.getDebugColors(), data));
    }

    verbose(message: any, data: any = '') {
        console.debug(this.formatMessage('VERBOSE', message, this.getVerboseColors(), data));
    }

    success(message: any, data: any = '') {
        console.log(this.formatMessage('SUCCESS', message, this.getSuccessColors(), data));
    }

    /** ---------- COLORS ---------- */
    private getLogColors() {
        return {
            level: chalk.green,
            message: chalk.green.bold,
            context: chalk.cyan.bold,
        };
    }

    private getInfoColors() {
        return {
            level: chalk.blue,
            message: chalk.blue.bold,
            context: chalk.blueBright.bold,
        };
    }

    private getErrorColors() {
        return {
            level: chalk.red,
            message: chalk.red.bold,
            context: chalk.redBright.bold,
        };
    }

    private getWarnColors() {
        return {
            level: chalk.yellow,
            message: chalk.yellow.bold,
            context: chalk.yellowBright.bold,
        };
    }

    private getDebugColors() {
        return {
            level: chalk.magenta,
            message: chalk.magenta.bold,
            context: chalk.magentaBright.bold,
        };
    }

    private getVerboseColors() {
        return {
            level: chalk.gray,
            message: chalk.gray.bold,
            context: chalk.white.dim,
        };
    }

    private getSuccessColors() {
        return {
            level: chalk.greenBright,
            message: chalk.greenBright.bold,
            context: chalk.green.bold,
        };
    }

    private formatMessage(
        level: string,
        message: any,
        colors: { level: any; message: any },
        data?: any,
    ): string {
        // Ensure level is safe
        const safeLevel = typeof level === 'string' && level.trim() !== '' ? level : 'UNKNOWN';

        // Ensure colors exist with fallbacks
        const safeColors = {
            level: (colors?.level && typeof colors.level === 'function')
                ? colors.level
                : (txt: string) => txt,
            message: (colors?.message && typeof colors.message === 'function')
                ? colors.message
                : (txt: string) => txt,
        };

        // Format message safely
        const formattedMessage = message !== undefined && message !== null
            ? this.formatMultiColorMessage(message, safeColors.message)
            : safeColors.message('[EMPTY MESSAGE]');

        // ---- SERVICE NAME (from NestLogger) ----
        const serviceCtx = this.context ? chalk.yellow(`[${this.context}]`) : '';

        // ---- EXTRA CONTEXT (manual) ----
        let extraCtx = '';
        if (typeof data === 'object') {
            try {
                extraCtx = this.formatObjectMessage(data);
            } catch {
                extraCtx = '[Invalid Context Object]';
            }
        } else if (typeof data === 'string') {
            extraCtx = this.parseColoredContext(data);
        } else {
            extraCtx = chalk.yellow.bold(String(data));
        }
        extraCtx = ' ' + extraCtx;

        const levelFormatted = safeColors.level(`[${safeLevel}]`);

        return `${levelFormatted} ${serviceCtx} ${formattedMessage}${extraCtx}`;
    }


    private formatMultiColorMessage(message: any, levelColor: any): string {
        if (typeof message === 'object') {
            return '\n' + this.formatObjectMessage(message);
        }

        let formatted = String(message);

        // Inline patterns
        formatted = formatted.replace(/\[([^\]]+)\]/g, chalk.cyan.bold('[$1]'));
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, chalk.white.bold('$1'));
        formatted = formatted.replace(/\*([^*]+)\*/g, chalk.yellow('$1'));
        formatted = formatted.replace(/_([^_]+)_/g, chalk.underline('$1'));

        return levelColor(formatted);
    }

    private formatObjectMessage(obj: any, indent = 2): string {
        if (Array.isArray(obj)) {
            return '[\n' + obj.map(
                (el) => ' '.repeat(indent) + this.formatObjectMessage(el, indent + 2)
            ).join(',\n') + '\n]';
        }

        if (obj && typeof obj === 'object') {
            const entries = Object.entries(obj).map(([key, value]) => {
                const coloredKey = chalk.cyan(`"${key}"`) + chalk.white(': ');
                const formattedValue = this.formatObjectMessage(value, indent + 2);
                return ' '.repeat(indent) + coloredKey + formattedValue;
            });
            return '{\n' + entries.join(',\n') + '\n' + ' '.repeat(indent - 2) + '}';
        }

        if (typeof obj === 'string') return chalk.blueBright.bold(`"${obj}"`);
        if (typeof obj === 'number') return chalk.yellow.bold(obj);
        if (typeof obj === 'boolean') return chalk.magenta.bold(obj);
        if (obj === null) return chalk.gray.bold('null');

        return chalk.cyanBright.bold(String(obj));
    }

    private parseColoredContext(context: string): string {
        if (/^\d+$/.test(context)) {
            return chalk.magentaBright.bold(context);
        }
        if (context === context.toUpperCase()) {
            return chalk.cyanBright.bold(context);
        }

        const colorPattern = /\{(\w+):([^}]+)\}/g;
        return context.replace(colorPattern, (match, colorName, text) => {
            const chalkColor = this.getChalkColor(colorName);
            return chalkColor ? chalkColor(text) : chalk.cyanBright.bold(text);
        });
    }

    private getChalkColor(colorName: string): any {
        const colorMap: { [key: string]: any } = {
            red: chalk.red,
            green: chalk.green,
            blue: chalk.blue,
            yellow: chalk.yellow,
            magenta: chalk.magenta,
            cyan: chalk.cyan,
            white: chalk.white,
            gray: chalk.gray,
            grey: chalk.gray,
            black: chalk.black,
            redBright: chalk.redBright,
            greenBright: chalk.greenBright,
            blueBright: chalk.blueBright,
            yellowBright: chalk.yellowBright,
            magentaBright: chalk.magentaBright,
            cyanBright: chalk.cyanBright,
            whiteBright: chalk.whiteBright,
            bold: chalk.bold,
            dim: chalk.dim,
            underline: chalk.underline,
            inverse: chalk.inverse,
        };
        return colorMap[colorName];
    }

    /** ---------- STATIC OVERRIDES ---------- */
    static log(message: any, context?: string) {
        new Logger(context).log(message, context);
    }

    static error(message: any, trace?: string, context?: string) {
        new Logger(context).error(message, context, trace);
    }

    static warn(message: any, context?: string) {
        new Logger(context).warn(message, context);
    }

    static debug(message: any, context?: string) {
        new Logger(context).debug(message, context);
    }

    static verbose(message: any, context?: string) {
        new Logger(context).verbose(message, context);
    }

    static success(message: any, context?: string) {
        new Logger(context).success(message, context);
    }
}
