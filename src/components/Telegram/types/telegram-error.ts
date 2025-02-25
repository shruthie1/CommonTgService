export class TelegramError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'TelegramError';
    }
}

export enum TelegramErrorCode {
    CLIENT_NOT_FOUND = 'CLIENT_NOT_FOUND',
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    OPERATION_FAILED = 'OPERATION_FAILED',
    INVALID_SESSION = 'INVALID_SESSION',
    FLOOD_WAIT = 'FLOOD_WAIT',
    PHONE_CODE_INVALID = 'PHONE_CODE_INVALID',
    PHONE_CODE_EXPIRED = 'PHONE_CODE_EXPIRED'
}