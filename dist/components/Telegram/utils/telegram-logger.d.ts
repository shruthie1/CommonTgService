export declare class TelegramLogger {
    private static instance;
    private logger;
    private constructor();
    static getInstance(): TelegramLogger;
    private shouldIncludeDetails;
    private formatMessage;
    info(mobile: string, operation: string, details?: any): void;
    error(mobile: string, operation: string, error: any): void;
    waning(mobile: string, message: string, details?: any): void;
    debug(mobile: string, message: string, details?: any): void;
}
