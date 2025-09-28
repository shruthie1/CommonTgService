import { Logger as NestLogger } from '@nestjs/common';
import chalk from "chalk";
import path from "path";
// import fs from "fs";
// import path from "path";

export class Logger extends NestLogger {
    context?: string;
    private logFilePath: string;

    constructor(contextFile?: string) {
        let localContext = contextFile;
        try {
            if (contextFile && typeof contextFile === "string") {
                // Extract filename without extension
                localContext = path.basename(contextFile, path.extname(contextFile));
            }
            
        } catch (err) {
            // Last fallback
            localContext = "Unknown";
        }
        super(localContext);

        chalk.level = 3; // force colors

        // Create logs dir if not exists
        // const logsDir = path.resolve(process.cwd(), "logs");
        // if (!fs.existsSync(logsDir)) {
        //     fs.mkdirSync(logsDir, { recursive: true });
        // }

        // // Dynamic file per service
        // const safeContext = context?.replace(/[^a-zA-Z0-9-_]/g, "_") || "general";
        // this.logFilePath = path.join(logsDir, `${safeContext}.log`);
    }

    private writeToFile(line: string) {
        // try {
        //     fs.appendFileSync(this.logFilePath, line + "\n", "utf8");
        // } catch (err) {
        //     process.stderr.write(chalk.red(`[Logger File Error] ${err}\n`));
        // }
    }

    log(message: any, data: any = "") {
        const line = this.formatMessage("LOG", message, this.getLogColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }

    info(message: any, data: any = "") {
        const line = this.formatMessage("INFO", message, this.getInfoColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }

    error(message: any, data: any = "", trace?: any) {
        const line = this.formatMessage("ERROR", message, this.getErrorColors(), data);
        process.stderr.write(line + (trace ? "\n" + chalk.red.bold(trace) : "") + "\n");
        this.writeToFile(this.stripAnsi(line + (trace ? "\n" + trace : "")));
    }

    warn(message: any, data: any = "") {
        const line = this.formatMessage("WARN", message, this.getWarnColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }

    debug(message: any, data: any = "") {
        const line = this.formatMessage("DEBUG", message, this.getDebugColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }

    verbose(message: any, data: any = "") {
        const line = this.formatMessage("VERBOSE", message, this.getVerboseColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }

    success(message: any, data: any = "") {
        const line = this.formatMessage("SUCCESS", message, this.getSuccessColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }

    /** ---------- COLORS ---------- */
    private getLogColors() {
        return { level: chalk.green, message: chalk.green, context: chalk.cyan.bold };
    }
    private getInfoColors() {
        return { level: chalk.blue, message: chalk.blue, context: chalk.blue.bold };
    }
    private getErrorColors() {
        return { level: chalk.red, message: chalk.red, context: chalk.red.bold };
    }
    private getWarnColors() {
        return { level: chalk.yellow, message: chalk.yellow, context: chalk.yellow.bold };
    }
    private getDebugColors() {
        return { level: chalk.magenta, message: chalk.grey, context: chalk.magenta.bold };
    }
    private getVerboseColors() {
        return { level: chalk.gray, message: chalk.magenta, context: chalk.white.dim };
    }
    private getSuccessColors() {
        return { level: chalk.greenBright, message: chalk.green.bold, context: chalk.green.bold };
    }

    /** ---------- FORMATTERS ---------- */
    private formatMessage(level: string, message: any, colors: { level: any; message: any }, data?: any): string {
        const safeLevel = typeof level === "string" && level.trim() !== "" ? level : "UNKNOWN";

        const safeColors = {
            level: typeof colors?.level === "function" ? colors.level : (txt: string) => txt,
            message: typeof colors?.message === "function" ? colors.message : (txt: string) => txt,
        };

        const formattedMessage =
            message !== undefined && message !== null
                ? this.formatMultiColorMessage(message, safeColors.message)
                : safeColors.message("[EMPTY MESSAGE]");

        const serviceCtx = this.context ? chalk.yellow(`[${this.context}]`) : "";

        let extraCtx = "";
        if (typeof data === "object" && data !== null) {
            try {
                extraCtx = this.formatObjectMessage(data);
            } catch {
                extraCtx = chalk.red("[Invalid Context Object]");
            }
        } else if (typeof data === "string") {
            extraCtx = this.parseColoredContext(data);
        } else if (data !== "" && data !== undefined) {
            extraCtx = chalk.yellow.bold(String(data));
        }
        if (extraCtx) extraCtx = " " + extraCtx;

        const levelFormatted = safeColors.level(`[${safeLevel}]`);

        return `${levelFormatted} ${serviceCtx} ${formattedMessage}${extraCtx}`;
    }

    private formatMultiColorMessage(message: any, levelColor: any): string {
        if (typeof message === "object" && message !== null) {
            return "\n" + this.formatObjectMessage(message);
        }

        let formatted = String(message);
        formatted = formatted.replace(/\[([^\]]+)\]/g, chalk.cyan.bold("[$1]"));
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, chalk.white.bold("$1"));
        formatted = formatted.replace(/\*([^*]+)\*/g, chalk.yellow("$1"));
        formatted = formatted.replace(/_([^_]+)_/g, chalk.underline("$1"));

        return levelColor(formatted);
    }

    private formatObjectMessage(obj: any, indent = 2, seen = new WeakSet()): string {
        if (obj === null) return chalk.gray.bold("null");

        if (typeof obj !== "object") {
            if (typeof obj === "string") return chalk.blueBright.bold(`"${obj}"`);
            if (typeof obj === "number") return chalk.yellow.bold(obj);
            if (typeof obj === "boolean") return chalk.magenta.bold(obj);
            return chalk.cyanBright.bold(String(obj));
        }

        if (seen.has(obj)) return chalk.red("[Circular]");
        seen.add(obj);

        if (Array.isArray(obj)) {
            return (
                "[\n" +
                obj.map((el) => " ".repeat(indent) + this.formatObjectMessage(el, indent + 2, seen)).join(",\n") +
                "\n" +
                " ".repeat(indent - 2) +
                "]"
            );
        }

        const entries = Object.entries(obj).map(([key, value]) => {
            const coloredKey = chalk.cyan(`"${key}"`) + chalk.white(": ");
            const formattedValue = this.formatObjectMessage(value, indent + 2, seen);
            return " ".repeat(indent) + coloredKey + formattedValue;
        });

        return "{\n" + entries.join(",\n") + "\n" + " ".repeat(indent - 2) + "}";
    }

    private parseColoredContext(context: string): string {
        if (/^\d+$/.test(context)) return chalk.magentaBright.bold(context);
        if (context === context.toUpperCase()) return chalk.yellow.bold(context);
        return chalk.cyanBright.bold(context);
    }

    private stripAnsi(str: string): string {
        return str.replace(/\x1B\[[0-9;]*m/g, ""); // remove colors for file logging
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

    /** ---------- CONSOLE OVERRIDES ---------- */
    static overrideConsole(serviceName = "Console") {
        const instance = new Logger(serviceName);

        console.log = (...args: any[]) => instance.log(args[0], args[1]);
        console.info = (...args: any[]) => instance.info(args[0], args[1]);
        console.error = (...args: any[]) => instance.error(args[0], args[1], args[2]);
        console.warn = (...args: any[]) => instance.warn(args[0], args[1]);
        console.debug = (...args: any[]) => instance.debug(args[0], args[1]);
        (console as any).success = (...args: any[]) => instance.success(args[0], args[1]);
    }
}

const logger = new Logger()