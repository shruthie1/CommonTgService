import { Logger as NestLogger } from '@nestjs/common';
export declare class Logger extends NestLogger {
    constructor(context?: string);
    log(message: any, data?: any): void;
    info(message: any, data?: any): void;
    error(message: any, data?: any, trace?: any): void;
    warn(message: any, data?: any): void;
    debug(message: any, data?: any): void;
    verbose(message: any, data?: any): void;
    success(message: any, data?: any): void;
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
