/**
 * Candidate source + enrolment batch shared by both pools (pool-onboarding M6).
 *
 * The `users` query, the per-client cap projection and the attempt loop were byte-identical
 * copies in buffer and promote; only the cap source and the enrol function differ.
 */
import { sleep } from 'telegram/Helpers';
import { ClientHelperUtils } from '../client-helper.utils';
import type { CheckEntry } from '../check-summary-notification';
import type { EnrolmentLogger } from './enrolment';

export interface ClientEnrolmentNeed {
    clientId: string;
    totalNeeded: number;
    windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
    totalActive: number;
    totalNeededForCount: number;
    calculationReason: string;
    priority: number;
}

export interface CandidateUser { mobile?: string; tgId?: string }

/** Mobiles never offered as candidates: live mains + every doc (any status) in either pool. */
export function buildEnrolmentExclusions(...groups: Array<Array<string | null | undefined>>): string[] {
    return groups.flat().filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Minimum `users.totalChats` for an enrolment candidate. */
export const ENROLMENT_MIN_TOTAL_CHATS = 150;

/**
 * The one auto-enrolment eligibility predicate on a `users` doc, as a Mongo filter: not expired,
 * no 2FA of ours (`twoFA: false`), owner inactive since `inactiveSince` (YYYY-MM-DD), enough chats.
 * Used by the scheduled candidate query and by operator setAs* (D7, owner 2026-10-27).
 */
export function enrolmentEligibilityFilter(inactiveSince: string) {
    return {
        expired: false,
        twoFA: false,
        lastActive: { $lt: inactiveSince },
        totalChats: { $gt: ENROLMENT_MIN_TOTAL_CHATS },
    };
}

/**
 * Human-readable reasons a user fails `enrolmentEligibilityFilter`, for error messages only.
 * Eligibility itself is decided by the Mongo filter; this only explains a miss.
 */
export function enrolmentIneligibilityReasons(
    user: { expired?: unknown; twoFA?: unknown; lastActive?: unknown; totalChats?: unknown },
    inactiveSince: string,
): string[] {
    const reasons: string[] = [];
    if (user.expired !== false) reasons.push('account is expired');
    if (user.twoFA !== false) reasons.push('2FA is already set (twoFA must be false)');
    if (typeof user.lastActive !== 'string' || !(user.lastActive < inactiveSince)) {
        reasons.push(`owner active recently (lastActive ${user.lastActive ?? 'missing'}, must be before ${inactiveSince})`);
    }
    if (typeof user.totalChats !== 'number' || !(user.totalChats > ENROLMENT_MIN_TOTAL_CHATS)) {
        reasons.push(`too few chats (totalChats ${user.totalChats ?? 'missing'}, must be > ${ENROLMENT_MIN_TOTAL_CHATS})`);
    }
    return reasons;
}

/** Only these fields of a candidate are read; never pull full user docs (sessions, relationships). */
export const ENROLMENT_CANDIDATE_PROJECTION = { _id: 0, mobile: 1, tgId: 1 } as const;

/**
 * Numeric order of two tgId strings (users.tgId is a String, so a Mongo sort is lexicographic:
 * '10' < '9'). Digit-only ids compare by length then digits (exact for any size, no BigInt);
 * a missing or non-numeric id sorts after every numeric one.
 */
export function compareTgIdNumeric(a?: string, b?: string): number {
    const na = typeof a === 'string' && /^\d+$/.test(a) ? a.replace(/^0+(?=\d)/, '') : undefined;
    const nb = typeof b === 'string' && /^\d+$/.test(b) ? b.replace(/^0+(?=\d)/, '') : undefined;
    if (na !== undefined && nb !== undefined) {
        if (na.length !== nb.length) return na.length - nb.length;
        return na < nb ? -1 : na > nb ? 1 : 0;
    }
    if (na !== undefined) return -1;
    if (nb !== undefined) return 1;
    const sa = a ?? '';
    const sb = b ?? '';
    return sa < sb ? -1 : sa > sb ? 1 : 0;
}

type CandidateUsersPort = {
    executeQuery(
        query: object,
        sort?: Record<string, 1 | -1>,
        limit?: number,
        skip?: number,
        projection?: Record<string, 0 | 1>,
    ): Promise<CandidateUser[]>;
};

/**
 * The one `users` candidate query: lowest NUMERIC tgId first (oldest accounts). Every eligible
 * user is fetched with only { mobile, tgId } (no Mongo sort or limit, which would be
 * lexicographic) and ordered here. Measured 2026-10-28: 576 eligible rows, ~26 KB, ~0.2 s,
 * lastActive index (no collection scan).
 */
export async function findEnrolmentCandidates(
    usersService: CandidateUsersPort,
    goodIds: string[],
    limit: number,
    inactiveSince: string,
): Promise<CandidateUser[]> {
    const rows = await usersService.executeQuery(
        { mobile: { $nin: goodIds }, ...enrolmentEligibilityFilter(inactiveSince) },
        undefined,
        undefined,
        undefined,
        { ...ENROLMENT_CANDIDATE_PROJECTION },
    );
    return [...rows].sort((x, y) => compareTgIdNumeric(x.tgId, y.tgId)).slice(0, Math.max(0, limit));
}

export interface EnrolmentBatchInput {
    label: 'buffer' | 'promote';
    logger: EnrolmentLogger;
    usersService: Parameters<typeof findEnrolmentCandidates>[0];
    goodIds: string[];
    needs: ClientEnrolmentNeed[];
    countedPerClient?: Map<string, number>;
    capFor(clientId: string): number;
    maxNewPerRun: number;
    inactiveSince: string;
    enrolOne(document: { mobile: string; tgId: string }, clientId: string, availableDate: string): Promise<boolean>;
}

export async function runEnrolmentBatch(input: EnrolmentBatchInput): Promise<{ createdCount: number; attemptedCount: number; createdEntries: CheckEntry[] }> {
    let totalNeeded = 0;
    for (const clientNeed of input.needs) totalNeeded += clientNeed.totalNeeded;
    totalNeeded = Math.min(totalNeeded, input.maxNewPerRun);
    if (totalNeeded === 0) return { createdCount: 0, attemptedCount: 0, createdEntries: [] };

    const documents = await findEnrolmentCandidates(input.usersService, input.goodIds, totalNeeded + 5, input.inactiveSince);

    const today = ClientHelperUtils.getTodayDateString();
    const assignmentQueue: Array<{ clientId: string; priority: number }> = [];
    const projectedHealthyCounts = new Map(input.countedPerClient || []);
    for (const clientNeed of input.needs) {
        const currentHealthyCount = projectedHealthyCounts.get(clientNeed.clientId) || 0;
        const remainingCapacity = Math.max(0, input.capFor(clientNeed.clientId) - currentHealthyCount);
        const cappedNeed = Math.min(clientNeed.totalNeeded, remainingCapacity);
        for (let i = 0; i < cappedNeed; i++) assignmentQueue.push({ clientId: clientNeed.clientId, priority: clientNeed.priority });
        if (cappedNeed > 0) projectedHealthyCounts.set(clientNeed.clientId, currentHealthyCount + cappedNeed);
    }

    let attemptedCount = 0;
    let createdCount = 0;
    let assignmentIndex = 0;
    const createdEntries: CheckEntry[] = [];
    const enrolledThisRun = new Set<string>();

    while (attemptedCount < totalNeeded && documents.length > 0 && assignmentIndex < assignmentQueue.length) {
        const document = documents.shift();
        if (!document || !document.mobile || !document.tgId) continue;
        // Skip if already processed in this batch (dynamic in-flight tracking)
        if (enrolledThisRun.has(document.mobile)) {
            input.logger.debug(`Skipping ${document.mobile}: already attempted in this enrollment run`);
            continue;
        }
        enrolledThisRun.add(document.mobile);
        const assignment = assignmentQueue[assignmentIndex];
        if (!assignment) break;
        try {
            const created = await input.enrolOne({ mobile: document.mobile, tgId: document.tgId }, assignment.clientId, today);
            if (created) {
                assignmentIndex++;
                createdCount++;
                createdEntries.push({ clientId: assignment.clientId, mobile: document.mobile });
            }
            attemptedCount++;
        } catch {
            input.logger.error(`Error creating connection for ${document.mobile}`);
            await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
            attemptedCount++;
        }
    }

    input.logger.log(`Dynamic batch completed: Created ${createdCount} new ${input.label} clients (${attemptedCount} attempted)`);
    return { createdCount, attemptedCount, createdEntries };
}
