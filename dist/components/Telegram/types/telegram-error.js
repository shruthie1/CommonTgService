"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramErrorCode = exports.TelegramError = void 0;
class TelegramError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'TelegramError';
    }
}
exports.TelegramError = TelegramError;
var TelegramErrorCode;
(function (TelegramErrorCode) {
    TelegramErrorCode["CLIENT_NOT_FOUND"] = "CLIENT_NOT_FOUND";
    TelegramErrorCode["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    TelegramErrorCode["OPERATION_FAILED"] = "OPERATION_FAILED";
    TelegramErrorCode["INVALID_SESSION"] = "INVALID_SESSION";
    TelegramErrorCode["FLOOD_WAIT"] = "FLOOD_WAIT";
    TelegramErrorCode["PHONE_CODE_INVALID"] = "PHONE_CODE_INVALID";
    TelegramErrorCode["PHONE_CODE_EXPIRED"] = "PHONE_CODE_EXPIRED";
})(TelegramErrorCode || (exports.TelegramErrorCode = TelegramErrorCode = {}));
//# sourceMappingURL=telegram-error.js.map