import { Api, TelegramClient } from "telegram";
import { sleep } from "telegram/Helpers";

export async function getUserFromSession(session: string, mobile: string):  Promise<Api.User> {
    if (!session) {
        throw new Error('Session is required');
    }

    let tempClient: TelegramClient | null = null;

    try {
        this.logger.logOperation(mobile, 'Creating temporary client for session validation');
        tempClient = new TelegramClient(session, parseInt(process.env.API_ID!), process.env.API_HASH!, {
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
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        this.logger.logError(mobile, 'Failed to get user from session', error);

        // Parse common Telegram errors for better error messages
        if (errorMessage.toLowerCase().includes('auth_key_unregistered')) {
            throw new Error('Session is invalid or expired');
        } else if (errorMessage.toLowerCase().includes('user_deactivated')) {
            throw new Error('User account has been deactivated');
        } else if (errorMessage.toLowerCase().includes('phone_number_banned')) {
            throw new Error('Phone number has been banned');
        } else if (errorMessage.toLowerCase().includes('timeout')) {
            throw new Error('Connection timeout while validating session');
        }

        throw new Error(`Failed to validate session: ${errorMessage}`);
    } finally {
        // Always cleanup the temporary client
        if (tempClient) {
            try {
                await tempClient.destroy();
                tempClient._eventBuilders = [];
                await sleep(2000);
                this.logger.logOperation(mobile, 'Temporary client cleaned up');
            } catch (cleanupError) {
                this.logger.logError(mobile, 'Failed to cleanup temporary client', cleanupError);
            } finally {
                tempClient._destroyed = true;
                if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                    await tempClient._sender.disconnect();
                }
                tempClient = null;
            }
        }
    }
}