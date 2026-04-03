import { contains } from "./common";

export default function isPermanentError(errorDetails: { error?: any, message: string, status?: number }): boolean {
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

  // Check the parsed message
  if (contains(errorDetails.message, permanentErrors) && !contains(errorDetails.message, ['INPUT_USER_DEACTIVATED'])) {
    return true;
  }

  // Check raw error message (with proper optional chaining)
  const rawMessage = errorDetails.error?.message || errorDetails.error?.errorMessage;
  if (contains(rawMessage, permanentErrors) && !contains(errorDetails.message, ['INPUT_USER_DEACTIVATED'])) {
    return true;
  }

  return false; // ✅ Explicit return
}
