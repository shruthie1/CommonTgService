/**
 * One auto-enrolment path for both pools (pool-onboarding M5).
 *
 * Telegram sequence per candidate is fixed and identical for both pools (pinned by the parity
 * harness ledger): connect -> hasPassword -> (channelInfo -> 5-10s sleep) -> unregister -> 10-15s
 * sleep. No login, no new session, no 2FA, no auth removal.
 */
import type { Model } from 'mongoose';
import { sleep } from 'telegram/Helpers';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import { channelInfo } from '../../../utils/telegram-utils/channelinfo';
import isPermanentError from '../../../utils/isPermanentError';
import type { parseError } from '../../../utils/parseError';
import type { RichNotificationInput } from '../../../utils/rich-message';
import { ClientHelperUtils } from '../client-helper.utils';
import { withEnrollmentLock } from '../enrollment-lock';
import { WarmupPhase } from '../warmup-phases';
import type { PoolProfile } from './pool-profile';

export interface EnrolmentLogger {
    debug(message: string, ...rest: unknown[]): void;
    log(message: string, ...rest: unknown[]): void;
    warn(message: string, ...rest: unknown[]): void;
    error(message: string, ...rest: unknown[]): void;
}

/** What the enrolment needs from the owning pool service (bound methods, no service import). */
export interface EnrolmentPort {
    profile: Readonly<PoolProfile>;
    model: Model<any>;
    logger: EnrolmentLogger;
    usersService: {
        search(filter: { mobile: string }): Promise<Array<{ session?: string | null }>>;
        expireAccount(mobile: string, reason: string): Promise<unknown>;
    };
    canonicalMobile(mobile: string): string;
    isMobileEnrolledAnywhere(mobile: string): Promise<string | null>;
    updateUser2FAStatus(tgId: string, mobile: string): Promise<void>;
    sendAccountNotice(input: RichNotificationInput): Promise<boolean>;
    handleError(error: unknown, context: string, mobile?: string): ReturnType<typeof parseError>;
    safeUnregisterClient(mobile: string): Promise<void>;
    /** Pool-only fields added to the enrolment write (promote: lastActive). */
    docExtras(): Record<string, unknown>;
}

export async function enrolPoolClientFromUser(
    port: EnrolmentPort,
    document: { mobile: string; tgId: string },
    targetClientId: string,
    availableDate?: string,
): Promise<boolean> {
    const { profile, logger } = port;
    const pool = profile.kind;
    // Cross-collection check: skip if already enrolled anywhere
    const enrolledIn = await port.isMobileEnrolledAnywhere(document.mobile);
    if (enrolledIn) {
        logger.debug(`Skipping ${document.mobile}: already enrolled in ${enrolledIn}`);
        return false;
    }

    const telegramClient = await connectionManager.getClient(document.mobile, { autoDisconnect: false });

    try {
        const hasPassword = await telegramClient.hasPassword();
        if (hasPassword) {
            logger.debug(`Skipping ${pool} enrollment for ${document.mobile}: account already has a 2FA password`);
            await port.updateUser2FAStatus(document.tgId, document.mobile);
            return false;
        }

        // No removeExternalLoginSessions, no set2fa, no createNewSession — channel info only.
        const channels = await channelInfo(telegramClient.client, true);
        await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

        const user = (await port.usersService.search({ mobile: document.mobile }))[0];
        if (!user?.session?.trim()) {
            logger.warn(`Skipping ${pool} enrollment for ${document.mobile}: source user/session missing`);
            return false;
        }
        const targetAvailableDate = availableDate || ClientHelperUtils.getTodayDateString();
        const extras = port.docExtras();

        const poolDoc = {
            tgId: document.tgId,
            ...extras,
            session: user.session.trim(), // Use old trusted session
            mobile: document.mobile,
            lastUsed: null,
            availableDate: targetAvailableDate,
            channels: channels.ids.length,
            clientId: targetClientId,
            status: 'active',
            message: 'Enrolled for warmup',
        };

        // Serialize the dedup re-check + write per canonical mobile (across buffer + promote in this
        // process): two live sessions on one account => Telegram SESSION_REVOKED (account loss).
        const enrolled = await withEnrollmentLock(port.canonicalMobile(document.mobile), async () => {
            const already = await port.isMobileEnrolledAnywhere(document.mobile);
            if (already && already !== profile.collection) {
                logger.warn(`Skipping ${pool} enrollment for ${document.mobile}: now enrolled in ${already}`);
                return false;
            }
            await port.model.findOneAndUpdate(
                { mobile: document.mobile },
                {
                    $set: {
                        ...poolDoc,
                        warmupPhase: WarmupPhase.ENROLLED,
                        warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                        enrolledAt: new Date(),
                    },
                },
                { returnDocument: 'after', upsert: true },
            ).exec();
            return true;
        });
        if (!enrolled) return false;

        logger.log(`Created ${profile.label}Client for ${targetClientId} with availability ${targetAvailableDate}`);
        await port.sendAccountNotice({
            severity: 'success',
            title: `${profile.label} enrolled`,
            fields: [
                { label: 'Client ID', value: targetClientId },
                { label: 'Mobile', value: document.mobile },
                { label: 'Available date', value: targetAvailableDate, code: false },
                { label: 'Channels', value: channels.ids.length, code: false },
                { label: 'Warmup phase', value: WarmupPhase.ENROLLED, code: false },
                { label: 'Source TG ID', value: document.tgId },
            ],
        });
        return true;
    } catch (error: unknown) {
        const errorDetails = port.handleError(error, 'Error processing client', document.mobile);
        logger.error(`Error processing ${pool} client ${document.mobile}: ${errorDetails.message}`);
        if (isPermanentError(errorDetails)) {
            // Retire the source user — cascades to deactivate buffer/promote pool docs
            try { await port.usersService.expireAccount(document.mobile, errorDetails.message); } catch { /* cascade is best effort, as before */ }
        }
        return false;
    } finally {
        await port.safeUnregisterClient(document.mobile);
        await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
    }
}
