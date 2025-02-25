export declare class TelegramError extends Error {
    readonly code?: string;
    readonly details?: unknown;
    constructor(message: string, code?: string, details?: unknown);
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
