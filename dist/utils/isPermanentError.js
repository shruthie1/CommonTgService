"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = isPermanentError;
const common_1 = require("./common");
function isPermanentError(errorDetails) {
    const permanentErrors = [
        'SESSION_REVOKED',
        'AUTH_KEY_UNREGISTERED',
        'AUTH_KEY_DUPLICATED',
        'SESSION_EXPIRED',
        'USER_DEACTIVATED',
        'USER_DEACTIVATED_BAN',
        'PHONE_NUMBER_BANNED',
        'PHONE_NUMBER_INVALID',
        'FROZEN_METHOD_INVALID',
        'FROZEN_PARTICIPANT_MISSING',
    ];
    if ((0, common_1.contains)(errorDetails.message, permanentErrors) && !(0, common_1.contains)(errorDetails.message, ['INPUT_USER_DEACTIVATED'])) {
        return true;
    }
    const rawMessage = errorDetails.error?.message || errorDetails.error?.errorMessage;
    if ((0, common_1.contains)(rawMessage, permanentErrors) && !(0, common_1.contains)(errorDetails.message, ['INPUT_USER_DEACTIVATED'])) {
        return true;
    }
    return false;
}
//# sourceMappingURL=isPermanentError.js.map