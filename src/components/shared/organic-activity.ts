import { sleep } from 'telegram/Helpers';
import { ClientHelperUtils } from './client-helper.utils';
import TelegramManager from '../Telegram/TelegramManager';
import { Logger } from '../../utils';

const logger = new Logger('OrganicActivity');

export type OrganicIntensity = 'light' | 'medium' | 'full';

/**
 * Simulates human-like app usage by performing read-only Telegram operations.
 * Called before every admin action and as the health check replacement.
 *
 * - light (1-2 min): getMe → pause → getDialogs(5)
 * - medium (3-5 min): getDialogs(15) → pause → read channel msgs → pause → getContacts
 * - full (5-10 min): getDialogs(20) → read msgs from channels → getContacts → getSelfMSgsInfo
 */
/**
 * Connection-fatal error patterns that must NOT be swallowed.
 * If organic activity hits one of these, the connection is dead —
 * proceeding with an admin action would fail and waste the attempt.
 */
const FATAL_ERROR_PATTERNS = [
    'auth_key_unregistered', 'session_revoked', 'session_expired',
    'user_deactivated_ban', 'user_deactivated', 'phone_number_banned',
    'auth_key_duplicated', 'frozen_method_invalid', 'frozen_participant_missing',
    'connection_not_inited',
];

function isConnectionFatalError(error: any): boolean {
    const msg = (error?.message || error?.errorMessage || error?.toString?.() || '').toLowerCase();
    return FATAL_ERROR_PATTERNS.some(p => msg.includes(p));
}

export async function performOrganicActivity(
    client: TelegramManager,
    intensity: OrganicIntensity = 'light'
): Promise<void> {
    try {
        switch (intensity) {
            case 'light':
                await performLightActivity(client);
                break;
            case 'medium':
                await performMediumActivity(client);
                break;
            case 'full':
                await performFullActivity(client);
                break;
        }
    } catch (error) {
        // Re-throw connection-fatal errors — the caller's catch block handles these
        if (isConnectionFatalError(error)) {
            logger.error(`Organic activity hit fatal error (${intensity}), re-throwing:`, error);
            throw error;
        }
        // Non-fatal errors (timeouts, rate limits on reads, etc.) — log and continue
        logger.warn(`Organic activity (${intensity}) failed (non-fatal):`, error);
    }
}

async function randomPause(minMs: number = 15000, maxMs: number = 45000): Promise<void> {
    const delay = ClientHelperUtils.gaussianRandom(
        (minMs + maxMs) / 2,
        (maxMs - minMs) / 4,
        minMs,
        maxMs
    );
    await sleep(delay);
}

/**
 * Light activity: ~1-2 minutes
 * Simulates quickly opening the app, glancing at chats
 */
async function performLightActivity(client: TelegramManager): Promise<void> {
    logger.debug('Performing light organic activity');

    // Fetch self info (what real clients do on connect)
    await client.getMe();
    await randomPause(15000, 30000);

    // Glance at recent dialogs
    await client.getDialogs({ limit: 5 });
    await randomPause(10000, 20000);
}

/**
 * Medium activity: ~3-5 minutes
 * Simulates opening app, browsing chats, checking a channel
 */
async function performMediumActivity(client: TelegramManager): Promise<void> {
    logger.debug('Performing medium organic activity');

    // Browse recent dialogs
    const dialogs = await client.getDialogs({ limit: 15 });
    await randomPause(20000, 40000);

    // Read messages from a random dialog (if any exist)
    if (dialogs && dialogs.length > 0) {
        const randomIdx = Math.floor(Math.random() * Math.min(dialogs.length, 5));
        const dialog = dialogs[randomIdx];
        if (dialog?.entity) {
            try {
                await client.getMessages(dialog.entity, 5);
            } catch {
                // Some dialogs may not be readable — that's fine
            }
            await randomPause(15000, 35000);
        }
    }

    // Check contacts
    try {
        await client.getContacts();
    } catch {
        // Contacts may fail on some accounts
    }
    await randomPause(10000, 25000);
}

/**
 * Full activity: ~5-10 minutes
 * Simulates an extended session — browsing, reading messages, checking saved messages
 */
async function performFullActivity(client: TelegramManager): Promise<void> {
    logger.debug('Performing full organic activity');

    // Browse dialogs
    const dialogs = await client.getDialogs({ limit: 20 });
    await randomPause(20000, 40000);

    // Read messages from 2-3 random dialogs
    if (dialogs && dialogs.length > 0) {
        const numToRead = Math.min(2 + Math.floor(Math.random() * 2), dialogs.length);
        const indices = new Set<number>();
        while (indices.size < numToRead) {
            indices.add(Math.floor(Math.random() * Math.min(dialogs.length, 10)));
        }

        for (const idx of indices) {
            const dialog = dialogs[idx];
            if (dialog?.entity) {
                try {
                    await client.getMessages(dialog.entity, 5);
                } catch {
                    // Skip unreadable dialogs
                }
                await randomPause(20000, 45000);
            }
        }
    }

    // Check contacts
    try {
        await client.getContacts();
    } catch {
        // Non-fatal
    }
    await randomPause(15000, 30000);

    // Check saved messages
    try {
        await client.getSelfMSgsInfo(10);
    } catch {
        // Non-fatal
    }
    await randomPause(10000, 20000);
}
