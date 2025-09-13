import { Logger as NestLogger } from '@nestjs/common';
import chalk from 'chalk';

export class Logger extends NestLogger {
    constructor(context?: string) {
        super(context);
        chalk.level = 3; // force colors
    }

    log(message: any, context?: any) {
        console.log(this.formatMessage('LOG', message, this.getLogColors(), context));
    }

    info(message: any, context?: any) {
        console.log(this.formatMessage('INFO', message, this.getInfoColors(), context));
    }

    error(message: any, context?: any, trace?: any) {
        console.error(
            this.formatMessage('ERROR', message, this.getErrorColors(), context),
            trace ? '\n' + chalk.red.bold(trace) : '',
        );
    }

    warn(message: any, context?: any) {
        console.warn(this.formatMessage('WARN', message, this.getWarnColors(), context));
    }

    debug(message: any, context?: any) {
        console.debug(this.formatMessage('DEBUG', message, this.getDebugColors(), context));
    }

    verbose(message: any, context?: any) {
        console.debug(this.formatMessage('VERBOSE', message, this.getVerboseColors(), context));
    }

    success(message: any, context?: any) {
        console.log(this.formatMessage('SUCCESS', message, this.getSuccessColors(), context));
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

    /** ---------- FORMATTERS ---------- */
private formatMessage(
    level: string,
    message: any,
    colors: { level: any; message: any },
    context?: any,
): string {
    // Ensure level is safe
    const safeLevel = typeof level === 'string' && level.trim() !== '' ? level : 'UNKNOWN';

    // Ensure colors exist with fallbacks
    const safeColors = {
        level: (colors?.level && typeof colors.level === 'function')
            ? colors.level
            : (txt: string) => txt, // fallback: no color
        message: (colors?.message && typeof colors.message === 'function')
            ? colors.message
            : (txt: string) => txt, // fallback: no color
    };

    // Format message safely
    const formattedMessage = message !== undefined && message !== null
        ? this.formatMultiColorMessage(message, safeColors.message)
        : safeColors.message('[EMPTY MESSAGE]');

    // Handle context safely
    let ctx = '';
    if (context !== undefined && context !== null) {
        if (typeof context === 'object') {
            try {
                ctx = `[${this.formatObjectMessage(context)}]`;
            } catch {
                ctx = '[Invalid Context Object]';
            }
        } else if (typeof context === 'string') {
            ctx = `[${this.parseColoredContext(context)}]`;
        } else {
            ctx = `[${String(context)}]`; // fallback for numbers, booleans, etc.
        }
    }

    const levelFormatted = safeColors.level(`[${safeLevel}]`);

    return `${levelFormatted}${ctx ? ' ' + ctx : ''} ${formattedMessage}`;
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

        if (typeof obj === 'string') return chalk.green(`"${obj}"`);
        if (typeof obj === 'number') return chalk.yellow(obj);
        if (typeof obj === 'boolean') return chalk.magenta(obj);
        if (obj === null) return chalk.gray('null');

        return chalk.white(String(obj));
    }

    private parseColoredContext(context: string): string {
        if (/^\d+$/.test(context)) {
            return chalk.magentaBright(context);
        }
        if (context === context.toUpperCase()) {
            return chalk.cyanBright(context);
        }

        const colorPattern = /\{(\w+):([^}]+)\}/g;
        return context.replace(colorPattern, (match, colorName, text) => {
            const chalkColor = this.getChalkColor(colorName);
            return chalkColor ? chalkColor(text) : text;
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
