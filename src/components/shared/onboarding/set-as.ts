/**
 * Operator enrolment (`setAsBufferClient` / `setAsPromoteClient`) for both pools
 * (pool-onboarding D8). Every per-pool difference is a PoolProfile.setAs value holding today's
 * behaviour: response messages, the buffer-only pacing draw after channel info, promote's
 * real `lastActive` date (Q10), clientId auto-assign, and the parseError context.
 *
 * Before Telegram: the auto-enrol eligibility filter (D7). Telegram: connect -> getChannelInfo -> (pacing) -> unregister. No login, session or auth change.
 */
import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { sleep } from 'telegram/Helpers';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import isPermanentError from '../../../utils/isPermanentError';
import { parseError } from '../../../utils/parseError';
import { ClientHelperUtils } from '../client-helper.utils';
import { withEnrollmentLock } from '../enrollment-lock';
import { WarmupPhase } from '../warmup-phases';
import { enrolmentEligibilityFilter, enrolmentIneligibilityReasons } from './candidate-source';
import { ONBOARDING_PACING, type PoolProfile } from './pool-profile';

export interface SetAsPort {
    profile: Readonly<PoolProfile>;
    model: Model<any>;
    usersService: {
        search(filter: { mobile: string; expired: boolean }): Promise<Array<{ tgId?: string; session?: string | null }>>;
        executeQuery(query: object, sort?: Record<string, 1 | -1>, limit?: number): Promise<unknown[]>;
        expireAccount(mobile: string, reason: string): Promise<unknown>;
    };
    clientService: { findAll(): Promise<Array<{ clientId: string; mobile: string }>> };
    telegramService: { getChannelInfo(mobile: string, sendIds: boolean): Promise<{ ids: unknown[] }> };
    canonicalMobile(mobile: string): string;
    mobilesMatch(a: string | null | undefined, b: string): boolean;
    findOne(mobile: string, throwErr: boolean): Promise<unknown>;
    otherPoolExistsByMobile(mobile: string): Promise<boolean>;
    isMobileEnrolledAnywhere(mobile: string): Promise<string | null>;
    withPoolClaimOrRefuse<T>(mobile: string, fn: () => Promise<T>): Promise<T>;
    safeUnregisterClient(mobile: string): Promise<void>;
    /** Auto-enrol inactivity cutoff (YYYY-MM-DD): the owner must not have been active since. */
    enrolmentInactiveSince(): string;
}

interface ClientCount { _id: string; count: number }

export async function setAsPoolClient(
    port: SetAsPort,
    mobile: string,
    clientId: string | undefined,
    availableDate: string,
): Promise<string> {
    const { profile } = port;
    const cfg = profile.setAs;
    const otherCollection = profile.collection === 'bufferClients' ? 'promoteClients' : 'bufferClients';
    const canonicalMobile = port.canonicalMobile(mobile);
    const user = (await port.usersService.search({ mobile: canonicalMobile, expired: false }))[0];
    if (!user) throw new BadRequestException(cfg.userNotFoundMessage);
    const sourceSession = user.session?.trim();
    if (!sourceSession) {
        throw new BadRequestException(`User session missing; cannot create ${cfg.entityName}`);
    }

    const isExist = await port.findOne(canonicalMobile, false);
    if (isExist) throw new ConflictException(cfg.alreadyExistsMessage);

    const clients = await port.clientService.findAll();
    const clientMobiles = clients.map((client) => client?.mobile);
    if (clientMobiles.some((clientMobile) => port.mobilesMatch(clientMobile, canonicalMobile))) throw new BadRequestException('Number is an Active Client');

    // Cross-pool guard: one account in BOTH pools = two live sessions on one Telegram account
    // => SESSION_REVOKED (permanent account loss).
    if (await port.otherPoolExistsByMobile(canonicalMobile)) {
        throw new BadRequestException(`Mobile ${canonicalMobile} is already enrolled in ${otherCollection}; refusing to create a cross-pool ${cfg.entityName}`);
    }

    // D7 (owner 2026-10-27): the operator path passes the same eligibility filter as auto-enrolment,
    // checked in Mongo before any Telegram connect.
    const inactiveSince = port.enrolmentInactiveSince();
    const eligible = await port.usersService.executeQuery(
        { mobile: canonicalMobile, ...enrolmentEligibilityFilter(inactiveSince) }, { tgId: 1 }, 1,
    );
    if (eligible.length === 0) {
        const reasons = enrolmentIneligibilityReasons(user as Record<string, unknown>, inactiveSince);
        throw new BadRequestException(`Mobile ${canonicalMobile} is not eligible for ${cfg.entityName}: ${reasons.length > 0 ? reasons.join('; ') : 'does not match the auto-enrol candidate filter'}`);
    }

    // Auto-assign clientId when the pool allows it: the client with the fewest active pool docs.
    let targetClientId = clientId;
    if (!profile.setAsRequiresClientId && !targetClientId && clients.length > 0) {
        const counts = await port.model.aggregate<ClientCount>([
            { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
            { $group: { _id: '$clientId', count: { $sum: 1 } } },
        ]);
        const countMap = new Map(counts.map((count) => [count._id, count.count]));
        let minCount = Infinity;
        for (const c of clients) {
            const count = countMap.get(c.clientId) || 0;
            if (count < minCount) {
                minCount = count;
                targetClientId = c.clientId;
            }
        }
    }

    await connectionManager.getClient(canonicalMobile, { autoDisconnect: false });
    try {
        // Only get channel info — no 2FA, no profile changes, no new session
        const channels = await port.telegramService.getChannelInfo(canonicalMobile, true);
        const p = ONBOARDING_PACING.setAsPostChannelInfoSleep;
        await sleep(ClientHelperUtils.gaussianRandom(p.mean, p.sd, p.min, p.max));

        const poolDoc = {
            tgId: user.tgId,
            ...(cfg.stampLastActive ? { lastActive: new Date().toISOString() } : {}),
            session: sourceSession, // Use old trusted session directly
            mobile: canonicalMobile,
            availableDate,
            channels: channels.ids.length,
            clientId: targetClientId,
            status: 'active',
            message: 'Enrolled for warmup',
            lastUsed: null,
        };
        // Same per-mobile lock + re-check as auto-enrolment: a concurrent enrolment of this mobile
        // into the other pool may have landed while we were on Telegram.
        await withEnrollmentLock(canonicalMobile, () => port.withPoolClaimOrRefuse(canonicalMobile, async () => {
            const already = await port.isMobileEnrolledAnywhere(canonicalMobile);
            if (already && already !== profile.collection) {
                throw new BadRequestException(`Mobile ${canonicalMobile} is already enrolled in ${already}; refusing to create a cross-pool ${cfg.entityName}`);
            }
            await port.model
                .findOneAndUpdate({ mobile: canonicalMobile }, {
                    $set: {
                        ...poolDoc,
                        warmupPhase: WarmupPhase.ENROLLED,
                        warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                        enrolledAt: new Date(),
                    },
                }, { returnDocument: 'after', upsert: true })
                .exec();
        }));
    } catch (error) {
        const errorDetails = cfg.errorContext
            ? parseError(error, `${cfg.errorContext} ${canonicalMobile}`)
            : parseError(error);
        // Retire permanently dead accounts at the source (cascades to pools)
        if (isPermanentError(errorDetails)) {
            try { await port.usersService.expireAccount(canonicalMobile, cfg.permanentErrorReason); } catch { /* best effort, as before */ }
        }
        throw new HttpException(errorDetails.message, errorDetails.status);
    } finally {
        await port.safeUnregisterClient(canonicalMobile);
    }
    return cfg.successMessage;
}
