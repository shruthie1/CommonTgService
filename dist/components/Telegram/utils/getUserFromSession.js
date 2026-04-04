"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromSession = getUserFromSession;
const telegram_1 = require("telegram");
const Helpers_1 = require("telegram/Helpers");
async function getUserFromSession(session, mobile) {
    if (!session) {
        throw new Error('Session is required');
    }
    let tempClient = null;
    try {
        this.logger.logOperation(mobile, 'Creating temporary client for session validation');
        tempClient = new telegram_1.TelegramClient(session, parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 3,
            retryDelay: 1000,
            timeout: 30000,
        });
        await tempClient.connect();
        if (!tempClient.connected) {
            throw new Error('Failed to establish connection to Telegram');
        }
        const userInfo = await tempClient.getMe();
        this.logger.logOperation(mobile, 'Successfully retrieved user info from session');
        return userInfo;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        this.logger.logError(mobile, 'Failed to get user from session', error);
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (lowerErrorMessage.includes('auth_key_unregistered') || lowerErrorMessage.includes('session_revoked') || lowerErrorMessage.includes('session_expired')) {
            throw new Error('Session is invalid or expired');
        }
        else if (lowerErrorMessage.includes('auth_key_duplicated')) {
            throw new Error('Session is invalid because the auth key was duplicated');
        }
        else if (lowerErrorMessage.includes('user_deactivated')) {
            throw new Error('User account has been deactivated');
        }
        else if (lowerErrorMessage.includes('phone_number_banned')) {
            throw new Error('Phone number has been banned');
        }
        else if (lowerErrorMessage.includes('frozen_method_invalid') || lowerErrorMessage.includes('frozen_participant_missing')) {
            throw new Error('Account is frozen');
        }
        else if (errorMessage.toLowerCase().includes('timeout')) {
            throw new Error('Connection timeout while validating session');
        }
        throw new Error(`Failed to validate session: ${errorMessage}`);
    }
    finally {
        if (tempClient) {
            try {
                await tempClient.destroy();
                tempClient._eventBuilders = [];
                await (0, Helpers_1.sleep)(2000);
                this.logger.logOperation(mobile, 'Temporary client cleaned up');
            }
            catch (cleanupError) {
                this.logger.logError(mobile, 'Failed to cleanup temporary client', cleanupError);
            }
            finally {
                if (tempClient) {
                    tempClient._destroyed = true;
                    if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                        await tempClient._sender.disconnect();
                    }
                    tempClient = null;
                }
            }
        }
    }
}
//# sourceMappingURL=getUserFromSession.js.map