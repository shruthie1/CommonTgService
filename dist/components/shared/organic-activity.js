"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performOrganicActivity = performOrganicActivity;
const Helpers_1 = require("telegram/Helpers");
const client_helper_utils_1 = require("./client-helper.utils");
const utils_1 = require("../../utils");
const logger = new utils_1.Logger('OrganicActivity');
const FATAL_ERROR_PATTERNS = [
    'auth_key_unregistered', 'session_revoked', 'session_expired',
    'user_deactivated_ban', 'user_deactivated', 'phone_number_banned',
    'auth_key_duplicated', 'frozen_method_invalid', 'frozen_participant_missing',
    'connection_not_inited',
];
function isConnectionFatalError(error) {
    const msg = (error?.message || error?.errorMessage || error?.toString?.() || '').toLowerCase();
    return FATAL_ERROR_PATTERNS.some(p => msg.includes(p));
}
async function performOrganicActivity(client, intensity = 'light') {
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
    }
    catch (error) {
        if (isConnectionFatalError(error)) {
            logger.error(`Organic activity hit fatal error (${intensity}), re-throwing:`, error);
            throw error;
        }
        logger.warn(`Organic activity (${intensity}) failed (non-fatal):`, error);
    }
}
async function randomPause(minMs = 15000, maxMs = 45000) {
    const delay = client_helper_utils_1.ClientHelperUtils.gaussianRandom((minMs + maxMs) / 2, (maxMs - minMs) / 4, minMs, maxMs);
    await (0, Helpers_1.sleep)(delay);
}
async function performLightActivity(client) {
    logger.debug('Performing light organic activity');
    await client.getMe();
    await randomPause(15000, 30000);
    await client.getDialogs({ limit: 5 });
    await randomPause(10000, 20000);
}
async function performMediumActivity(client) {
    logger.debug('Performing medium organic activity');
    const dialogs = await client.getDialogs({ limit: 15 });
    await randomPause(20000, 40000);
    if (dialogs && dialogs.length > 0) {
        const randomIdx = Math.floor(Math.random() * Math.min(dialogs.length, 5));
        const dialog = dialogs[randomIdx];
        if (dialog?.entity) {
            try {
                await client.getMessages(dialog.entity, 5);
            }
            catch {
            }
            await randomPause(15000, 35000);
        }
    }
    try {
        await client.getContacts();
    }
    catch {
    }
    await randomPause(10000, 25000);
}
async function performFullActivity(client) {
    logger.debug('Performing full organic activity');
    const dialogs = await client.getDialogs({ limit: 20 });
    await randomPause(20000, 40000);
    if (dialogs && dialogs.length > 0) {
        const numToRead = Math.min(2 + Math.floor(Math.random() * 2), dialogs.length);
        const indices = new Set();
        while (indices.size < numToRead) {
            indices.add(Math.floor(Math.random() * Math.min(dialogs.length, 10)));
        }
        for (const idx of indices) {
            const dialog = dialogs[idx];
            if (dialog?.entity) {
                try {
                    await client.getMessages(dialog.entity, 5);
                }
                catch {
                }
                await randomPause(20000, 45000);
            }
        }
    }
    try {
        await client.getContacts();
    }
    catch {
    }
    await randomPause(15000, 30000);
    try {
        await client.getSelfMSgsInfo(10);
    }
    catch {
    }
    await randomPause(10000, 20000);
}
//# sourceMappingURL=organic-activity.js.map