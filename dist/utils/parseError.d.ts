import { AxiosError, AxiosResponse } from "axios";
interface ErrorResponse {
    status: number;
    message: string;
    error: string;
    raw?: any;
}
interface ErrorHandlingConfig {
    maxMessageLength: number;
    notificationTimeout: number;
    ignorePatterns: RegExp[];
    defaultStatus: number;
    defaultMessage: string;
    defaultError: string;
}
export declare function extractMessage(data: any, path?: string, depth?: number, maxDepth?: number): string;
declare function sendNotification(url: string, timeout?: number): Promise<AxiosResponse | undefined>;
export declare function parseError(err: any, prefix?: string, sendErr?: boolean, config?: Partial<ErrorHandlingConfig>): ErrorResponse;
export declare function isAxiosError(error: unknown): error is AxiosError;
export declare function createError(message: string, status?: number, errorType?: string): ErrorResponse;
export declare const ErrorUtils: {
    parseError: typeof parseError;
    extractMessage: typeof extractMessage;
    sendNotification: typeof sendNotification;
    createError: typeof createError;
    isAxiosError: typeof isAxiosError;
};
export {};
