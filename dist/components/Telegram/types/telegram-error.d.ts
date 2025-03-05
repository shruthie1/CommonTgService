export declare class TelegramError extends Error {
    readonly code?: string | undefined;
    readonly details?: unknown;
    status: any;
    constructor(message: string, code?: string | undefined, details?: unknown);
}
export declare enum TelegramErrorCode {
    CLIENT_NOT_FOUND = "CLIENT_NOT_FOUND",
    CONNECTION_FAILED = "CONNECTION_FAILED",
    OPERATION_FAILED = "OPERATION_FAILED",
    INVALID_SESSION = "INVALID_SESSION",
    FLOOD_WAIT = "FLOOD_WAIT",
    PHONE_CODE_INVALID = "PHONE_CODE_INVALID",
    PHONE_CODE_EXPIRED = "PHONE_CODE_EXPIRED"
}
