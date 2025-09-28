"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const common_1 = require("@nestjs/common");
const chalk_1 = __importDefault(require("chalk"));
const path_1 = __importDefault(require("path"));
class Logger extends common_1.Logger {
    constructor(contextFile) {
        let localContext = contextFile;
        try {
            if (contextFile && typeof contextFile === "string") {
                localContext = path_1.default.basename(contextFile, path_1.default.extname(contextFile));
            }
        }
        catch (err) {
            localContext = "Unknown";
        }
        super(localContext);
        chalk_1.default.level = 3;
    }
    writeToFile(line) {
    }
    log(message, data = "") {
        const line = this.formatMessage("LOG", message, this.getLogColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }
    info(message, data = "") {
        const line = this.formatMessage("INFO", message, this.getInfoColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }
    error(message, data = "", trace) {
        const line = this.formatMessage("ERROR", message, this.getErrorColors(), data);
        process.stderr.write(line + (trace ? "\n" + chalk_1.default.red.bold(trace) : "") + "\n");
        this.writeToFile(this.stripAnsi(line + (trace ? "\n" + trace : "")));
    }
    warn(message, data = "") {
        const line = this.formatMessage("WARN", message, this.getWarnColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }
    debug(message, data = "") {
        const line = this.formatMessage("DEBUG", message, this.getDebugColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }
    verbose(message, data = "") {
        const line = this.formatMessage("VERBOSE", message, this.getVerboseColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }
    success(message, data = "") {
        const line = this.formatMessage("SUCCESS", message, this.getSuccessColors(), data);
        process.stdout.write(line + "\n");
        this.writeToFile(this.stripAnsi(line));
    }
    getLogColors() {
        return { level: chalk_1.default.green, message: chalk_1.default.green, context: chalk_1.default.cyan.bold };
    }
    getInfoColors() {
        return { level: chalk_1.default.blue, message: chalk_1.default.blue, context: chalk_1.default.blue.bold };
    }
    getErrorColors() {
        return { level: chalk_1.default.red, message: chalk_1.default.red, context: chalk_1.default.red.bold };
    }
    getWarnColors() {
        return { level: chalk_1.default.yellow, message: chalk_1.default.yellow, context: chalk_1.default.yellow.bold };
    }
    getDebugColors() {
        return { level: chalk_1.default.magenta, message: chalk_1.default.grey, context: chalk_1.default.magenta.bold };
    }
    getVerboseColors() {
        return { level: chalk_1.default.gray, message: chalk_1.default.magenta, context: chalk_1.default.white.dim };
    }
    getSuccessColors() {
        return { level: chalk_1.default.greenBright, message: chalk_1.default.green.bold, context: chalk_1.default.green.bold };
    }
    formatMessage(level, message, colors, data) {
        const safeLevel = typeof level === "string" && level.trim() !== "" ? level : "UNKNOWN";
        const safeColors = {
            level: typeof colors?.level === "function" ? colors.level : (txt) => txt,
            message: typeof colors?.message === "function" ? colors.message : (txt) => txt,
        };
        const formattedMessage = message !== undefined && message !== null
            ? this.formatMultiColorMessage(message, safeColors.message)
            : safeColors.message("[EMPTY MESSAGE]");
        const serviceCtx = this.context ? chalk_1.default.yellow(`[${this.context}]`) : "";
        let extraCtx = "";
        if (typeof data === "object" && data !== null) {
            try {
                extraCtx = this.formatObjectMessage(data);
            }
            catch {
                extraCtx = chalk_1.default.red("[Invalid Context Object]");
            }
        }
        else if (typeof data === "string") {
            extraCtx = this.parseColoredContext(data);
        }
        else if (data !== "" && data !== undefined) {
            extraCtx = chalk_1.default.yellow.bold(String(data));
        }
        if (extraCtx)
            extraCtx = " " + extraCtx;
        const levelFormatted = safeColors.level(`[${safeLevel}]`);
        return `${levelFormatted} ${serviceCtx} ${formattedMessage}${extraCtx}`;
    }
    formatMultiColorMessage(message, levelColor) {
        if (typeof message === "object" && message !== null) {
            return "\n" + this.formatObjectMessage(message);
        }
        let formatted = String(message);
        formatted = formatted.replace(/\[([^\]]+)\]/g, chalk_1.default.cyan.bold("[$1]"));
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, chalk_1.default.white.bold("$1"));
        formatted = formatted.replace(/\*([^*]+)\*/g, chalk_1.default.yellow("$1"));
        formatted = formatted.replace(/_([^_]+)_/g, chalk_1.default.underline("$1"));
        return levelColor(formatted);
    }
    formatObjectMessage(obj, indent = 2, seen = new WeakSet()) {
        if (obj === null)
            return chalk_1.default.gray.bold("null");
        if (typeof obj !== "object") {
            if (typeof obj === "string")
                return chalk_1.default.blueBright.bold(`"${obj}"`);
            if (typeof obj === "number")
                return chalk_1.default.yellow.bold(obj);
            if (typeof obj === "boolean")
                return chalk_1.default.magenta.bold(obj);
            return chalk_1.default.cyanBright.bold(String(obj));
        }
        if (seen.has(obj))
            return chalk_1.default.red("[Circular]");
        seen.add(obj);
        if (Array.isArray(obj)) {
            return ("[\n" +
                obj.map((el) => " ".repeat(indent) + this.formatObjectMessage(el, indent + 2, seen)).join(",\n") +
                "\n" +
                " ".repeat(indent - 2) +
                "]");
        }
        const entries = Object.entries(obj).map(([key, value]) => {
            const coloredKey = chalk_1.default.cyan(`"${key}"`) + chalk_1.default.white(": ");
            const formattedValue = this.formatObjectMessage(value, indent + 2, seen);
            return " ".repeat(indent) + coloredKey + formattedValue;
        });
        return "{\n" + entries.join(",\n") + "\n" + " ".repeat(indent - 2) + "}";
    }
    parseColoredContext(context) {
        if (/^\d+$/.test(context))
            return chalk_1.default.magentaBright.bold(context);
        if (context === context.toUpperCase())
            return chalk_1.default.yellow.bold(context);
        return chalk_1.default.cyanBright.bold(context);
    }
    stripAnsi(str) {
        return str.replace(/\x1B\[[0-9;]*m/g, "");
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
    static overrideConsole(serviceName = "Console") {
        const instance = new Logger(serviceName);
        console.log = (...args) => instance.log(args[0], args[1]);
        console.info = (...args) => instance.info(args[0], args[1]);
        console.error = (...args) => instance.error(args[0], args[1], args[2]);
        console.warn = (...args) => instance.warn(args[0], args[1]);
        console.debug = (...args) => instance.debug(args[0], args[1]);
        console.success = (...args) => instance.success(args[0], args[1]);
    }
}
exports.Logger = Logger;
const logger = new Logger();
//# sourceMappingURL=logger.js.map