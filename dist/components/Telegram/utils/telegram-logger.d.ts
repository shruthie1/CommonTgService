export declare class TelegramLogger {
    private logger;
    constructor(serviceName?: string);
    info(mobile: string, operation: string, details?: any): void;
    error(mobile: string, operation: string, error: any): void;
    warn(mobile: string, message: string, details?: any): void;
    debug(mobile: string, message: string, details?: any): void;
    verbose(mobile: string, message: string, details?: any): void;
    log(mobile: string, message: string, details?: any): void;
}
