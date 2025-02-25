export declare class TelegramLogger {
    private static instance;
    private logger;
    private constructor();
    static getInstance(): TelegramLogger;
    logOperation(mobile: string, operation: string, details?: any): void;
    logError(mobile: string, operation: string, error: any): void;
    logWarning(mobile: string, message: string, details?: any): void;
    logDebug(mobile: string, message: string, details?: any): void;
}
