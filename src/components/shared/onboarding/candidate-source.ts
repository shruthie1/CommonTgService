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

/** The one `users` candidate query (lowest tgId first). */
export function findEnrolmentCandidates(
    usersService: { executeQuery(query: object, sort?: Record<string, 1 | -1>, limit?: number): Promise<CandidateUser[]> },
    goodIds: string[],
    limit: number,
    inactiveSince: string,
): Promise<CandidateUser[]> {
    return usersService.executeQuery(
        {
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: inactiveSince },
            totalChats: { $gt: 150 },
        },
        { tgId: 1 },
        limit,
    );
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
