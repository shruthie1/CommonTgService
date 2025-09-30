"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = isPermanentError;
const common_1 = require("./common");
function isPermanentError(errorDetails) {
    const permanentErrors = [
        'SESSION_REVOKED',
        'AUTH_KEY_UNREGISTERED',
        'USER_DEACTIVATED',
        'USER_DEACTIVATED_BAN',
        'FROZEN_METHOD_INVALID',
    ];
    if ((0, common_1.contains)(errorDetails.message, permanentErrors)) {
        return true;
    }
    const rawMessage = errorDetails.error?.message || errorDetails.error?.errorMessage;
    if ((0, common_1.contains)(rawMessage, permanentErrors)) {
        return true;
    }
    return false;
}
//# sourceMappingURL=isPermanentError.js.map