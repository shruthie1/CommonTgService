import { Logger as NestLogger } from '@nestjs/common';
import chalk from 'chalk';

export class Logger extends NestLogger {
    constructor(context?: string) {
        super(context);
        chalk.level = 3; // force colors in all environments
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
            level: chalk.green.bold,
            message: chalk.green,
            context: chalk.cyan.bold,
            timestamp: chalk.gray,
        };
    }

    private getInfoColors() {
        return {
            level: chalk.blue.bold,
            message: chalk.blue,
            context: chalk.blueBright.bold,
            timestamp: chalk.gray,
        };
    }

    private getErrorColors() {
        return {
            level: chalk.red.bold,
            message: chalk.red,
            context: chalk.redBright.bold,
            timestamp: chalk.gray,
        };
    }

    private getWarnColors() {
        return {
            level: chalk.yellow.bold,
            message: chalk.yellow,
            context: chalk.yellowBright.bold,
            timestamp: chalk.gray,
        };
    }

    private getDebugColors() {
        return {
            level: chalk.magenta.bold,
            message: chalk.magenta,
            context: chalk.magentaBright.bold,
            timestamp: chalk.gray,
        };
    }

    private getVerboseColors() {
        return {
            level: chalk.gray.bold,
            message: chalk.gray,
            context: chalk.white.dim,
            timestamp: chalk.gray.dim,
        };
    }

    private getSuccessColors() {
        return {
            level: chalk.greenBright.bold,
            message: chalk.greenBright,
            context: chalk.green.bold,
            timestamp: chalk.gray,
        };
    }

    private formatMessage(
        level: string,
        message: any,
        colors: any,
        context?: any,
    ) {
        const formattedMessage = this.formatMultiColorMessage(message, colors.message);

        // Fully colorful context
        const ctx = context !== undefined
            ? `[${typeof context === 'object'
                ? this.formatObjectMessage(context)   // ✅ fully colorful JSON
                : this.parseColoredContext(context)}]`
            : '';

        const levelFormatted = colors.level(`[${level}]`);

        return `${levelFormatted}${ctx ? ' ' + ctx : ''} ${formattedMessage}`;
    }


    private formatMultiColorMessage(message: any, levelColor: any): string {
        if (typeof message === 'object') {
            return this.formatObjectMessage(message);
        }

        let formatted = String(message);

        // Inline patterns
        formatted = formatted.replace(/\[([^\]]+)\]/g, chalk.cyan.bold('[$1]'));
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, chalk.white.bold('$1'));
        formatted = formatted.replace(/\*([^*]+)\*/g, chalk.yellow('$1'));
        formatted = formatted.replace(/_([^_]+)_/g, chalk.underline('$1'));

        return levelColor(formatted);
    }

    private formatObjectMessage(obj: any): string {
        const jsonStr = JSON.stringify(obj, null, 2);

        return jsonStr
            .replace(/"([^"]+)":/g, chalk.cyan('"$1"') + chalk.white(':')) // keys
            .replace(/: "([^"]+)"/g, ': ' + chalk.green('"$1"')) // strings
            .replace(/: (\d+)/g, ': ' + chalk.yellow('$1')) // numbers
            .replace(/: (true|false)/g, ': ' + chalk.magenta('$1')) // booleans
            .replace(/: null/g, ': ' + chalk.gray('null')); // null
    }

    private parseColoredContext(context: string): string {
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
