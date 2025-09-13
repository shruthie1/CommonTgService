import { Logger as NestLogger } from '@nestjs/common';
export declare class Logger extends NestLogger {
    constructor(context?: string);
    log(message: any, context?: any): void;
    info(message: any, context?: any): void;
    error(message: any, context?: any, trace?: any): void;
    warn(message: any, context?: any): void;
    debug(message: any, context?: any): void;
    verbose(message: any, context?: any): void;
    success(message: any, context?: any): void;
    private getLogColors;
    private getInfoColors;
    private getErrorColors;
    private getWarnColors;
    private getDebugColors;
    private getVerboseColors;
    private getSuccessColors;
    private formatMessage;
    private formatMultiColorMessage;
    private formatObjectMessage;
    private parseColoredContext;
    private getChalkColor;
    static log(message: any, context?: string): void;
    static error(message: any, trace?: string, context?: string): void;
    static warn(message: any, context?: string): void;
    static debug(message: any, context?: string): void;
    static verbose(message: any, context?: string): void;
    static success(message: any, context?: string): void;
}
