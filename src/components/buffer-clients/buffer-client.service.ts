import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { ActiveChannel } from '../active-channels';
import {
    BadRequestException,
    ConflictException,
    HttpException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    forwardRef,
    Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JOIN_REQUEST_MODEL_NAME, type JoinRequestDocument } from '../join-requests/join-request.schema';
import { ClientSession, Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import {
    BufferClient,
    BufferClientDocument,
    buildSpamEligibleFilter,
    HARSH_RECHECK_AFTER_MS,
} from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { Api, TelegramClient } from 'telegram';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { parseError } from '../../utils/parseError';
import { buildCheckSummaryNotification, type CheckEntry } from '../shared/check-summary-notification';
import { sendBotNotice } from '../../utils/bot-notice';
import { currentNoticeBatch, eventsToTable, runWithNoticeBatch, sendNoticeBatched } from '../../utils/notice-batch';
import { connectionManager } from '../Telegram/utils/connection-manager';
import TelegramManager from '../Telegram/TelegramManager';
import { SessionService } from '../session-manager';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import { Client } from '../clients';
import isPermanentError from '../../utils/isPermanentError';
import { PersonaPool, PersonaAssignment, generateCandidateCombinations, personaKey } from '../../utils/persona-assignment';
import { nameMatchesAssignment, lastNameMatches } from '../../utils/homoglyph-normalizer';
import { BotsService, ChannelCategory } from '../bots';
import {
    BaseClientUpdate,
    BaseClientService,
    ClientStatusType,
    ClientConfig,
    WindowNeed,
    performOrganicActivity,
    WarmupPhase,
    getWarmupPhaseAction,
    calculateWarmupPriority,
} from '../shared/base-client.service';
import { ClientHelperUtils } from '../shared/client-helper.utils';
import { withEnrollmentLock } from '../shared/enrollment-lock';
import { withPoolClaim } from '../shared/onboarding/pool-claim';
import { BUFFER_PROFILE, isHealthyForLegacyCap } from '../shared/onboarding/pool-profile';
import { enrolPoolClientFromUser, type EnrolmentPort } from '../shared/onboarding/enrolment';
import { buildEnrolmentExclusions, runEnrolmentBatch } from '../shared/onboarding/candidate-source';
import type { AvailabilityNeeds } from '../shared/base-client.service';
import {
    allocateByNeed,
    BufferSupplyConfig,
    BufferSupplyConfigResult,
    CapClassifiableDoc,
    CapCountedKind,
    CapExclusionReason,
    classifyBufferForCap,
    classifyOptionsFromConfig,
    computeClientSupplyTarget,
    computeFleetEnrollmentBudget,
    engineWeeklyCeiling,
    LEGACY_HEALTHY_CAP,
    readBufferSupplyConfig,
} from './buffer-supply';

type ClientCount = { _id: string; count: number };
type EnrollmentDecision = {
    clientId: string;
    healthyCount: number;
    healthyCap: number;
    remainingCapacity: number;
    readyActive: number;
    warmingPipeline: number;
    totalActive: number;
    totalNeeded: number;
    calculationReason: string;
    priority: number;
    replenishmentWindows: WindowNeed[];
    shortTermWindows: WindowNeed[];
    supply?: Record<string, unknown>;
    wouldEnroll?: number;
    cappedReason?: string | null;
    blockedReason?: string;
};
type BufferSupplyPlanEntry = {
    clientId: string;
    counted: number;
    countedByKind: Record<CapCountedKind, number>;
    excluded: Partial<Record<CapExclusionReason, number>>;
    /** Graduated mobiles without a trusted SpamBot verdict (never checked / stale free). */
    needsSpamCheck: string[];
    consumed: number;
    ratePerDay: number;
    target: number;
    cap: number;
    windowNeed: number;
    need: number;
    allocated: number;
    priority: number;
    reason: string;
    availability: AvailabilityNeeds;
};
export type BufferSupplyPlan = {
    mode: BufferSupplyConfig['mode'];
    invalidConfig: string[];
    config: BufferSupplyConfig;
    fleet: {
        budget: number;
        weeklyRemaining: number | null;
        pipelineCapacity: number | null;
        pipelineRemaining: number | null;
        enrolledLast7d: number | null;
        fleetWarming: number | null;
        weeklyCeiling: number | null;
    };
    entries: BufferSupplyPlanEntry[];
    countedPerClient: Map<string, number>;
    capPerClient: Map<string, number>;
};
type ClientNeed = { clientId: string; totalNeeded: number; priority: number };
type Allocation = { clientId: string; allocated: number; priority: number };
type BufferClientQuery = Record<string, unknown>;
type WarmupDiagnosticEntry = {
    mobile: string;
    dbPhase: string;
    computedPhase: string;
    action: string;
    priority: number;
    failedAttempts: number;
    lastAttemptHoursAgo: number | null;
    processSkipReason: string | null;
    privacyDone: boolean;
    twoFADone: boolean;
    authsRemoved: boolean;
    channels: number;
    onCooldown: boolean;
};
type WarmupSimulationEntry = Pick<WarmupDiagnosticEntry, 'mobile' | 'dbPhase' | 'computedPhase' | 'action' | 'priority'> & {
    isMutation: boolean;
    wouldConsumeSlot: boolean;
};
type WarmupSimulationSkip = { mobile: string; action: string; priority?: number; reason: string };

@Injectable()
export class BufferClientService extends BaseClientService<BufferClientDocument> {
    private readonly MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT = BUFFER_PROFILE.legacyHealthyCap;
    private readyRotationInProgress = false;

    /** @deprecated Test compatibility alias: now reflects the warmup-check reentrancy flag
     *  (the global maintenance lock was removed). >0 means a warmup check is in progress. */
    private get checkingBufferClientsSince(): number {
        return this.isWarmupCheckProcessing ? 1 : 0;
    }

    private set checkingBufferClientsSince(value: number) {
        this.isWarmupCheckProcessing = value > 0;
    }

    private promoteClientService: PromoteClientService;

    constructor(
        @InjectModel('bufferClientModule')
        private bufferClientModel: Model<BufferClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        telegramService: TelegramService,
        @Inject(forwardRef(() => UsersService))
        usersService: UsersService,
        @Inject(forwardRef(() => ActiveChannelsService))
        activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ClientService))
        clientService: ClientService,
        @Inject(forwardRef(() => ChannelsService))
        channelsService: ChannelsService,
        @Inject(forwardRef(() => PromoteClientService))
        promoteClientServiceRef: PromoteClientService,
        @Inject(forwardRef(() => SessionService))
        sessionService: SessionService,
        botsService: BotsService,
        @Optional()
        @InjectModel(JOIN_REQUEST_MODEL_NAME)
        joinRequestModel?: Model<JoinRequestDocument>,
    ) {
        super(
            telegramService,
            usersService,
            activeChannelsService,
            clientService,
            channelsService,
            sessionService,
            botsService,
            BufferClientService.name,
        );
        this.promoteClientService = promoteClientServiceRef;
        this.joinRequestModel = joinRequestModel;
    }

    private async getPrimaryClientMobiles(clientId?: string | null): Promise<Set<string>> {
        const clients = await this.clientService.findAll();
        const primaryClientMobiles = new Set(
            clients
                .filter((client) => !!client.mobile && (!clientId || client.clientId === clientId))
                .map((client) => client.mobile),
        );
        this.logger.debug('Resolved primary client mobiles for buffer guards', {
            clientId: clientId || 'all',
            count: primaryClientMobiles.size,
        });
        return primaryClientMobiles;
    }

    private isPrimaryClientMobile(mobile: string, primaryClientMobiles: Set<string>): boolean {
        return !!mobile && primaryClientMobiles.has(mobile);
    }

    /**
     * Recovery accounts are already terminal but cannot be selected by the
     * runtime until they reach the buffer floor. Put them ahead of new warmup
     * accounts without changing which accounts are eligible or increasing any
     * Telegram activity limits.
     */
    private async findPrioritizedJoinCandidates(query: BufferClientQuery): Promise<BufferClientDocument[]> {
        const limit = this.config.maxMapSize;
        const operationalFloor = this.config.operationalChannelThreshold ?? 200;
        const recoveryQuery: BufferClientQuery = {
            ...query,
            warmupPhase: { $in: [WarmupPhase.READY, WarmupPhase.SESSION_ROTATED] },
            channels: { $lt: operationalFloor },
        };

        const recoveryQueryResult = this.bufferClientModel
            .find(recoveryQuery)
            .sort({ channels: -1 })
            .limit(limit);
        const recoveryCandidates = await this.resolveJoinCandidateQuery(recoveryQueryResult);
        if (recoveryCandidates.length >= limit) return recoveryCandidates;

        const recoveryMobiles = new Set(recoveryCandidates.map((candidate) => candidate.mobile));
        const standardQueryResult = this.bufferClientModel
            .find(query)
            .sort({ channels: -1 })
            .limit(limit);
        const standardCandidates = await this.resolveJoinCandidateQuery(standardQueryResult);

        return [
            ...recoveryCandidates,
            ...standardCandidates.filter((candidate) => !recoveryMobiles.has(candidate.mobile)),
        ].slice(0, limit);
    }

    private async resolveJoinCandidateQuery(query: unknown): Promise<BufferClientDocument[]> {
        const executable = query as { exec?: () => Promise<BufferClientDocument[]> };
        return typeof executable.exec === 'function'
            ? executable.exec()
            : Promise.resolve(query as BufferClientDocument[]);
    }

    private isHealthyBufferClientForCap(doc: Partial<BufferClientDocument>, _now: number): boolean {
        return isHealthyForLegacyCap(doc, this.operationalFloor, this.MAX_FAILED_ATTEMPTS);
    }

    /** BUFFER_SUPPLY_* config (process.env = the Mongo configuration doc), fail-closed to legacy. */
    getBufferSupplyConfig(): BufferSupplyConfigResult {
        return readBufferSupplyConfig(
            process.env,
            engineWeeklyCeiling(this.MAX_SENSITIVE_ACTIONS_PER_CYCLE, this.WARMUP_RUNS_PER_DAY),
        );
    }

    /**
     * Per-client enrolment plan. Dynamic mode: count only usable-now-or-soon accounts
     * (classifyBufferForCap), size each client's target to its own recent swaps, and share the run's
     * enrolment budget (bounded by the warmup engine ceiling) by need. Legacy mode reproduces the
     * pre-2026-10-24 computation exactly (old cap counting, cap 20, window need, priority order).
     */
    async buildBufferSupplyPlan(clients: Array<Pick<Client, 'clientId'>>, now: number = Date.now()): Promise<BufferSupplyPlan> {
        const { config, invalid } = this.getBufferSupplyConfig();
        const operationalFloor = this.config.operationalChannelThreshold ?? 200;
        const classifyOptions = classifyOptionsFromConfig(config, operationalFloor, this.MAX_FAILED_ATTEMPTS);
        const assigned = await this.bufferClientModel
            .find(
                { clientId: { $exists: true, $ne: null }, status: 'active' },
                {
                    mobile: 1, clientId: 1, warmupPhase: 1, channels: 1, failedUpdateAttempts: 1, inUse: 1,
                    spamStatus: 1, limitedUntil: 1, spamCheckedAt: 1,
                },
            )
            .exec() as unknown as Array<CapClassifiableDoc & { mobile?: string; clientId?: string }>;

        const countedPerClient = new Map<string, number>();
        const capPerClient = new Map<string, number>();
        const perClient = new Map<string, {
            counted: Record<CapCountedKind, number>;
            excluded: Partial<Record<CapExclusionReason, number>>;
            needsSpamCheck: string[];
        }>();
        let fleetWarming = 0;
        for (const doc of assigned) {
            if (!doc.clientId) continue;
            let bucket = perClient.get(doc.clientId);
            if (!bucket) {
                bucket = { counted: { usable: 0, limited_soon: 0, pipeline: 0 }, excluded: {}, needsSpamCheck: [] };
                perClient.set(doc.clientId, bucket);
            }
            if (config.mode === 'legacy') {
                if (this.isHealthyBufferClientForCap(doc as Partial<BufferClientDocument>, now)) {
                    countedPerClient.set(doc.clientId, (countedPerClient.get(doc.clientId) || 0) + 1);
                }
                continue;
            }
            const verdict = classifyBufferForCap(doc, now, classifyOptions);
            if ('kind' in verdict) {
                bucket.counted[verdict.kind] += 1;
                countedPerClient.set(doc.clientId, (countedPerClient.get(doc.clientId) || 0) + 1);
                if (verdict.kind === 'pipeline') fleetWarming += 1;
            } else {
                const reason = verdict.reason;
                bucket.excluded[reason] = (bucket.excluded[reason] || 0) + 1;
                // Never-checked / stale-free graduates get their SpamBot check on the swap path
                // (setupClient probes every candidate without a fresh free verdict); listed so ops can see them.
                if ((reason === 'never_checked' || reason === 'stale_free') && doc.mobile) {
                    bucket.needsSpamCheck.push(doc.mobile);
                }
            }
        }

        const consumedPerClient = new Map<string, number>();
        let enrolledLast7d = 0;
        if (config.mode === 'dynamic') {
            const since = new Date(now - config.consumptionWindowDays * this.ONE_DAY_MS);
            // Swap-outs per client: setupClient stamps lastUsed on the replaced main whether it returns
            // to the pool or is inactivated, so any-status docs with a recent lastUsed = recent swaps.
            const consumedRows: ClientCount[] = await this.bufferClientModel.aggregate<ClientCount>([
                { $match: { clientId: { $exists: true, $ne: null }, lastUsed: { $gte: since } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]);
            for (const row of consumedRows || []) consumedPerClient.set(row._id, row.count);
            enrolledLast7d = await this.bufferClientModel.countDocuments({ enrolledAt: { $gte: new Date(now - 7 * this.ONE_DAY_MS) } });
        }

        const entries: BufferSupplyPlanEntry[] = [];
        for (const client of clients) {
            const availability = await this.calculateAvailabilityBasedNeedsForCurrentState(client.clientId);
            const counted = countedPerClient.get(client.clientId) || 0;
            const bucket = perClient.get(client.clientId) || { counted: { usable: 0, limited_soon: 0, pipeline: 0 }, excluded: {}, needsSpamCheck: [] };
            if (config.mode === 'legacy') {
                const cap = LEGACY_HEALTHY_CAP;
                const remaining = Math.max(0, cap - counted);
                const need = Math.min(availability.totalNeeded, remaining);
                capPerClient.set(client.clientId, cap);
                entries.push({
                    clientId: client.clientId, counted, countedByKind: bucket.counted, excluded: bucket.excluded,
                    needsSpamCheck: [], consumed: 0, ratePerDay: 0, target: this.config.minTotalClients, cap,
                    windowNeed: availability.totalNeeded, need, allocated: 0, priority: availability.priority,
                    reason: need < availability.totalNeeded
                        ? `${availability.calculationReason}; capped to remaining healthy capacity ${remaining}/${cap}`
                        : availability.calculationReason,
                    availability,
                });
                continue;
            }
            const consumed = consumedPerClient.get(client.clientId) || 0;
            const target = computeClientSupplyTarget({ consumed, counted }, config);
            const remaining = Math.max(0, target.cap - counted);
            const need = Math.min(remaining, Math.max(target.need, availability.totalNeeded));
            capPerClient.set(client.clientId, target.cap);
            entries.push({
                clientId: client.clientId, counted, countedByKind: bucket.counted, excluded: bucket.excluded,
                needsSpamCheck: bucket.needsSpamCheck, consumed, ratePerDay: target.ratePerDay, target: target.target,
                cap: target.cap, windowNeed: availability.totalNeeded, need, allocated: 0, priority: availability.priority,
                reason: `supply ${counted}/${target.target} (cap ${target.cap}; ${consumed} swaps in ${config.consumptionWindowDays}d)`,
                availability,
            });
        }

        let fleet: BufferSupplyPlan['fleet'];
        if (config.mode === 'legacy') {
            // Old allocation: priority order, first come first served up to the per-run maximum.
            let left = this.config.maxNewClientsPerTrigger;
            for (const entry of [...entries].sort((a, b) => a.priority - b.priority)) {
                if (left <= 0) break;
                if (entry.need <= 0) continue;
                entry.allocated = Math.min(entry.need, left);
                left -= entry.allocated;
            }
            fleet = { budget: this.config.maxNewClientsPerTrigger, weeklyRemaining: null, pipelineCapacity: null, pipelineRemaining: null, enrolledLast7d: null, fleetWarming: null, weeklyCeiling: null };
        } else {
            const budget = computeFleetEnrollmentBudget({
                maxNewPerRun: this.config.maxNewClientsPerTrigger,
                weeklyCeiling: config.fleetWeeklyCeiling,
                enrolledLast7d,
                fleetWarming,
                leadTimeDays: config.leadTimeDays,
            });
            const allocation = allocateByNeed(entries.map((e) => ({ clientId: e.clientId, need: e.need, target: e.target })), budget.budget);
            for (const entry of entries) entry.allocated = allocation.get(entry.clientId) || 0;
            fleet = { ...budget, enrolledLast7d, fleetWarming, weeklyCeiling: config.fleetWeeklyCeiling };
        }

        // Dynamic enrolment order = most-starved first (allocation order is by need share, then need).
        // Legacy keeps the old priority order.
        const ordered = config.mode === 'legacy' ? [...entries].sort((a, b) => a.priority - b.priority) : [...entries].sort((a, b) =>
            (b.allocated / Math.max(1, b.target)) - (a.allocated / Math.max(1, a.target))
            || b.need - a.need
            || a.priority - b.priority
            || a.clientId.localeCompare(b.clientId));
        return { mode: config.mode, invalidConfig: invalid, config, fleet, entries: ordered, countedPerClient, capPerClient };
    }

    /** Ops audit line per client + one fleet line. grep "Buffer supply plan". */
    private logBufferSupplyPlan(plan: BufferSupplyPlan): void {
        if (plan.invalidConfig.length) {
            this.logger.warn(`Buffer supply config invalid, using legacy enrolment: ${plan.invalidConfig.join(', ')}`);
        }
        for (const entry of plan.entries) {
            this.logger.info(`[${entry.clientId}] Buffer supply plan`, {
                mode: plan.mode,
                counted: entry.counted,
                countedByKind: entry.countedByKind,
                excluded: entry.excluded,
                needsSpamCheck: entry.needsSpamCheck,
                consumed: entry.consumed,
                ratePerDay: Number(entry.ratePerDay.toFixed(2)),
                target: entry.target,
                cap: entry.cap,
                windowNeed: entry.windowNeed,
                need: entry.need,
                allocated: entry.allocated,
            });
        }
        this.logger.info('Buffer supply plan (fleet)', {
            mode: plan.mode,
            ...plan.fleet,
            totalNeed: plan.entries.reduce((sum, e) => sum + e.need, 0),
            totalAllocated: plan.entries.reduce((sum, e) => sum + e.allocated, 0),
        });
    }

    // ---- Abstract implementations ----

    get model(): Model<BufferClientDocument> {
        return this.bufferClientModel;
    }

    get clientType(): 'buffer' {
        return 'buffer';
    }

    get config(): ClientConfig {
        return {
            joinChannelInterval: 6 * 60 * 1000,      // 6 minutes
            leaveChannelInterval: BUFFER_PROFILE.pacing.leaveChannelIntervalMs, // 120 seconds (owner-gated Q3)
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,             // 120s (redesigned from 20s)
            channelTarget: BUFFER_PROFILE.channelTarget, // Must exceed buffer swap threshold (200+)
            maxJoinsPerSession: 12,
            maxNewClientsPerTrigger: BUFFER_PROFILE.maxNewClientsPerTrigger,
            minTotalClients: BUFFER_PROFILE.minTotalClients,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: BUFFER_PROFILE.pacing.clientProcessingDelayMs, // 10s between clients (owner-gated Q3)
            maxChannelJoinsPerDay: 25,
            joinsPerMobilePerRound: 4,
            operationalChannelThreshold: BUFFER_PROFILE.operationalFloor,
        };
    }

    // ---- Buffer-specific: updateNameAndBio (uses full client.name) ----

    async updateNameAndBio(doc: BufferClientDocument, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'medium');

            const me = await telegramClient.getMe();
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

            let updateCount = 0;

            // A pool with pics but no firstNames/lastNames/bios cannot fail the name/bio step.
            const hasNameBioPool = (client.firstNames?.length > 0) || (client.bufferLastNames?.length > 0) || (client.bios?.length > 0);
            if ((client.firstNames?.length > 0) || (client.bufferLastNames?.length > 0) || (client.bios?.length > 0) || (client.profilePics?.length > 0)) {
                // ── PERSONA BRANCH ──────────────────────────────────────────
                let assignment: Pick<PersonaAssignment, 'assignedFirstName' | 'assignedLastName' | 'assignedBio' | 'assignedProfilePics'> | null = null;
                let unassignableReason: string | null = null;

                // 1. Check if doc already has a valid assignment (any assigned field set AND pool version matches)
                const hasValidAssignment = (
                    doc.assignedFirstName != null ||
                    doc.assignedLastName != null ||
                    doc.assignedBio != null
                );

                if (hasValidAssignment) {
                    assignment = {
                        assignedFirstName: doc.assignedFirstName,
                        assignedLastName: doc.assignedLastName,
                        assignedBio: doc.assignedBio,
                        assignedProfilePics: doc.assignedProfilePics,
                    };
                } else {
                    // 2. Atomic assignment via findOneAndUpdate with guard
                    const pool: PersonaPool = {
                        firstNames: client.firstNames,
                        lastNames: client.bufferLastNames || [],
                        bios: client.bios || [],
                        profilePics: client.profilePics || [],
                        dbcoll: client.dbcoll,
                    };

                    // Query existing assignments for dedup (buffer collection)
                    const existingAssignments: Array<{ mobile: string; assignedFirstName: string; assignedLastName?: string; assignedBio?: string; assignedProfilePics?: string[] }> = await this.model.find({
                        clientId: doc.clientId, status: 'active',
                        mobile: { $ne: doc.mobile },
                        $or: [
                            { assignedFirstName: { $ne: null } },
                            { assignedLastName: { $ne: null } },
                            { assignedBio: { $ne: null } },
                            { 'assignedProfilePics.0': { $exists: true } },
                        ],
                    }, { mobile: 1, assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedProfilePics: 1 }).lean();

                    // Cross-collection dedup: also fetch promote assignments (best-effort)
                    try {
                        const promoteAssignments = await this.promoteClientService.model.find({
                            clientId: doc.clientId, status: 'active',
                            mobile: { $ne: doc.mobile },
                            $or: [
                                { assignedFirstName: { $ne: null } },
                                { assignedLastName: { $ne: null } },
                                { assignedBio: { $ne: null } },
                                { 'assignedProfilePics.0': { $exists: true } },
                            ],
                        }, { mobile: 1, assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedProfilePics: 1 }).lean();
                        existingAssignments.push(...promoteAssignments);
                    } catch { /* cross-collection dedup is best-effort */ }

                    const activeClientAssignment = await this.clientService.getActiveClientAssignment(client);
                    if (activeClientAssignment && activeClientAssignment.mobile !== doc.mobile && !existingAssignments.some(a => a.mobile === activeClientAssignment.mobile)) {
                        existingAssignments.push(activeClientAssignment);
                    }

                    const usedKeys = new Set(existingAssignments.map(a => personaKey({
                        firstName: a.assignedFirstName,
                        lastName: a.assignedLastName || '',
                        bio: a.assignedBio || '',
                        profilePics: a.assignedProfilePics || [],
                    })));

                    const candidates = generateCandidateCombinations(pool, doc.mobile);
                    const chosen = candidates.find(c => !usedKeys.has(personaKey(c)));

                    if (!chosen) {
                        this.logger.warn(`No unique persona candidate available for ${doc.mobile}, falling back to first candidate`);
                    }

                    const pick = chosen || candidates[0];
                    if (pick) {
                        const result = await this.model.findOneAndUpdate(
                            {
                                mobile: doc.mobile,
                                $or: [
                                    {
                                        assignedFirstName: null,
                                        assignedLastName: null,
                                        assignedBio: null,
                                        'assignedProfilePics.0': { $exists: false },
                                    },
                                ],
                            },
                            { $set: {
                                assignedFirstName: pick.firstName,
                                assignedLastName: pick.lastName || null,
                                assignedBio: pick.bio || null,
                                assignedProfilePics: pick.profilePics,
                            } },
                            { returnDocument: 'after' },
                        );

                        if (result) {
                            assignment = {
                                assignedFirstName: result.assignedFirstName,
                                assignedLastName: result.assignedLastName,
                                assignedBio: result.assignedBio,
                                assignedProfilePics: result.assignedProfilePics,
                            };
                            this.logger.log(`Assigned persona "${pick.firstName}" to ${doc.mobile}`);
                        } else {
                            // Guard not met: another run may have assigned concurrently. Re-read and
                            // use that assignment if it holds a name/bio; only otherwise is it a failure.
                            const fresh = await this.model.findOne(
                                { mobile: doc.mobile },
                                { assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedProfilePics: 1 },
                            ).lean();
                            if (fresh && (fresh.assignedFirstName != null || fresh.assignedLastName != null || fresh.assignedBio != null)) {
                                assignment = {
                                    assignedFirstName: fresh.assignedFirstName,
                                    assignedLastName: fresh.assignedLastName,
                                    assignedBio: fresh.assignedBio,
                                    assignedProfilePics: fresh.assignedProfilePics,
                                };
                                this.logger.log(`Using concurrently assigned persona for ${doc.mobile}`);
                            } else {
                                this.logger.warn(`Atomic persona assignment failed for ${doc.mobile} (guard condition not met)`);
                                unassignableReason = 'atomic persona assignment guard not met';
                            }
                        }
                    }
                }

                // 3. Apply persona corrections if we have an assignment
                const hasAnyAssignment = assignment != null && (
                    assignment.assignedFirstName != null ||
                    assignment.assignedLastName != null ||
                    assignment.assignedBio != null
                );
                if (!hasNameBioPool) {
                    // Pics-only pool: nothing name/bio-shaped exists to apply. Same as no pool.
                    this.logger.warn(`Persona pool for ${doc.mobile} has no firstNames/lastNames/bios — marking name/bio step done`);
                    updateCount = 1;
                } else if (hasAnyAssignment) {
                    // Read current TG profile state once (needed for lastName and bio checks)
                    const fullUser: unknown = await telegramClient.client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
                    const currentLastName = this.readNestedString(fullUser, ['users', 0, 'lastName']);
                    const currentBio = this.readNestedString(fullUser, ['fullUser', 'about']);

                    // Check firstName mismatch
                    const firstNameWrong = assignment?.assignedFirstName != null
                        && !nameMatchesAssignment(me.firstName || '', assignment.assignedFirstName);
                    // Check lastName mismatch (only when assignedLastName is non-null)
                    const lastNameWrong = assignment?.assignedLastName != null
                        && !lastNameMatches(currentLastName, assignment.assignedLastName);

                    if (firstNameWrong || lastNameWrong) {
                        const displayFirstName = assignment.assignedFirstName || me.firstName || '';
                        const displayLastName = assignment.assignedLastName || '';
                        this.logger.log(`Updating persona name/lastName for ${doc.mobile}`);
                        await performOrganicActivity(telegramClient, 'medium');
                        await telegramClient.client.invoke(new Api.account.UpdateProfile({
                            firstName: displayFirstName,
                            lastName: displayLastName,
                        }));
                        updateCount++;
                        await sleep(ClientHelperUtils.gaussianRandom(5000, 1000, 3000, 7000));
                    }

                    // Check and update bio if assignedBio is non-null and mismatches
                    if (assignment.assignedBio != null && currentBio !== assignment.assignedBio) {
                        this.logger.log(`Updating persona bio for ${doc.mobile}`);
                        await performOrganicActivity(telegramClient, 'light');
                        await sleep(ClientHelperUtils.gaussianRandom(12500, 3000, 8000, 18000));
                        await telegramClient.client.invoke(new Api.account.UpdateProfile({ about: assignment.assignedBio }));
                        updateCount++;
                    }

                    // Assignment resolved — the step is satisfied even if the profile already
                    // matched and no write was needed.  Without this the account loops on
                    // update_name_bio forever (nameBioUpdatedAt never stamped, failures never
                    // incremented, so zombie detection never fires).  Mirrors updateProfilePhotos.
                    updateCount = Math.max(updateCount, 1);
                } else if (unassignableReason) {
                    // The atomic guard did not match and no concurrent name/bio assignment exists:
                    // a failure, not a silent no-op (otherwise update_name_bio repeats every run).
                    return await this.recordNameBioStepFailure(doc.mobile, failedAttempts, unassignableReason);
                } else {
                    // No candidate could be built: nothing to apply. Same as no pool.
                    this.logger.warn(`No persona candidate for ${doc.mobile} — marking name/bio step done`);
                    updateCount = 1;
                }
            } else {
                // No persona pool on client — stamp nameBioUpdatedAt anyway so the
                // pipeline advances.  Without this the account loops on update_name_bio forever.
                this.logger.warn(`No persona pool for ${doc.mobile} (clientId: ${doc.clientId}) — marking name/bio step done to unblock pipeline`);
                updateCount = 1;
            }

            await this.update(doc.mobile, {
                ...(updateCount > 0 ? { nameBioUpdatedAt: new Date() } : {}),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Updated name and bio for ${doc.mobile}`);
            await sleep(ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
            return updateCount;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating profile', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.deactivateClient(doc.mobile, reason, { permanent: true });
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    // ---- Buffer-specific: updateUsername (sets username via updateUsernameForAClient) ----

    async updateUsername(doc: BufferClientDocument, client: Client, failedAttempts: number): Promise<number> {
        // If username is already stored in DB, skip entirely — no TG connection needed
        if (doc.username) {
            this.logger.debug(`Username already set for ${doc.mobile}: @${doc.username}, skipping TG update`);
            await this.update(doc.mobile, {
                usernameUpdatedAt: doc.usernameUpdatedAt || new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
            });
            return 1;
        }
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'light');

            const me = await telegramClient.getMe();
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            const updatedUsername = await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
            await this.update(doc.mobile, {
                username: updatedUsername || me.username,
                usernameUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Updated username for ${doc.mobile}`);
            await sleep(ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
            return 1;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating username', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.deactivateClient(doc.mobile, reason, { permanent: true });
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    // ---- CRUD (buffer-specific) ----

    private normalizeSessionForWrite(session: unknown): string | undefined {
        if (session === undefined) return undefined;
        if (session === null) {
            throw new BadRequestException('session cannot be blank');
        }
        if (typeof session !== 'string') {
            throw new BadRequestException('session must be a string');
        }
        const normalized = session.trim();
        if (!normalized) {
            throw new BadRequestException('session cannot be blank');
        }
        return normalized;
    }

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClientDocument> {
        const canonicalMobile = this.canonicalMobile(bufferClient.mobile);
        const status = bufferClient.status || 'active';
        const session = this.normalizeSessionForWrite(bufferClient.session);
        if (status === 'active' && !session) {
            throw new BadRequestException('Active BufferClient requires a session');
        }
        // Cross-collection dedup guard: prevent the same mobile from being created in
        // bufferClients when it already lives in another pool (promote/clients) — the same
        // account running concurrently across pools causes Telegram SESSION_REVOKED.
        // The check-then-create is serialized per canonical mobile (across buffer + promote
        // services in this process) so two concurrent enrollments can't both pass the check.
        const result = await withEnrollmentLock(canonicalMobile, () => this.withPoolClaimOrRefuse(canonicalMobile, async () => {
            const enrolledIn = await this.isMobileEnrolledAnywhere(canonicalMobile);
            if (enrolledIn && enrolledIn !== 'bufferClients') {
                throw new BadRequestException(
                    `Mobile ${canonicalMobile} is already enrolled in ${enrolledIn}; refusing to create a cross-pool BufferClient`
                );
            }
            const createData = {
                ...bufferClient,
                mobile: canonicalMobile,
                ...(session ? { session } : {}),
                status,
                warmupPhase: WarmupPhase.ENROLLED,
                warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                enrolledAt: new Date(),
                sessionRotatedAt: null,
            };
            return this.bufferClientModel.create({ ...createData });
        }));
        this.logger.log(`Buffer Client Created:\n\nMobile: ${canonicalMobile}`);
        await this.sendAccountNotice(
            {
                severity: 'success',
                title: 'Buffer created',
                fields: [
                    { label: 'Mobile', value: canonicalMobile },
                    { label: 'Client ID', value: bufferClient.clientId || '-' },
                    { label: 'Status', value: result.status, code: false },
                    { label: 'Available date', value: bufferClient.availableDate || '-', code: false },
                    { label: 'Channels', value: bufferClient.channels ?? '-', code: false },
                    { label: 'Note', value: bufferClient.message || '-', code: false },
                ],
            }
        );
        return result;
    }

    async findAll(status?: ClientStatusType): Promise<BufferClientDocument[]> {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<BufferClientDocument | null> {
        const canonicalMobile = this.canonicalMobile(mobile);
        const bufferClient = (await this.bufferClientModel.findOne({ mobile: canonicalMobile }).exec())?.toJSON() || null;
        if (!bufferClient && throwErr) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return bufferClient;
    }

    async existsByMobile(mobile: string): Promise<boolean> {
        const canonicalMobile = this.canonicalMobile(mobile);
        return !!(await this.bufferClientModel.findOne({ mobile: canonicalMobile }, { _id: 1 }).lean().exec());
    }

    async update(mobile: string, updateClientDto: BaseClientUpdate): Promise<BufferClientDocument> {
        const canonicalMobile = this.canonicalMobile(mobile);
        const updateData: BaseClientUpdate & { mobile?: string } = { ...updateClientDto };
        // `channels` is a count: never persist a negative or fractional one (a -13 reached prod once).
        if (typeof updateData.channels === 'number') {
            updateData.channels = Number.isFinite(updateData.channels) ? Math.max(0, Math.floor(updateData.channels)) : 0;
        }
        const normalizedSession = this.normalizeSessionForWrite(updateData.session);
        if (normalizedSession) {
            updateData.session = normalizedSession;
        }
        if (updateData.mobile !== undefined) {
            const payloadMobile = this.canonicalMobile(updateData.mobile);
            if (payloadMobile !== canonicalMobile) {
                throw new BadRequestException('mobile in payload must match route mobile');
            }
            updateData.mobile = canonicalMobile;
        }
        if (updateData.status === 'active' && !(updateData.session || await this.getStoredActiveSession(canonicalMobile))) {
            throw new BadRequestException('Cannot activate BufferClient without a session');
        }
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate({ mobile: canonicalMobile }, { $set: updateData }, { returnDocument: 'after' })
            .exec();
        if (!updatedBufferClient) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return updatedBufferClient;
    }

    async createOrUpdate(mobile: string, createorUpdateBufferClientDto: CreateBufferClientDto | UpdateBufferClientDto): Promise<BufferClientDocument> {
        const canonicalMobile = this.canonicalMobile(mobile);
        if (await this.existsByMobile(canonicalMobile)) {
            const updateDto: UpdateBufferClientDto = {
                ...createorUpdateBufferClientDto,
                mobile: canonicalMobile,
            };
            return this.update(canonicalMobile, updateDto);
        } else {
            const createDto: CreateBufferClientDto = {
                ...createorUpdateBufferClientDto,
                mobile: canonicalMobile,
                status: (createorUpdateBufferClientDto as CreateBufferClientDto).status || 'active',
            } as CreateBufferClientDto;
            return this.create(createDto);
        }
    }

    async remove(mobile: string, message?: string): Promise<void> {
        try {
            const canonicalMobile = this.canonicalMobile(mobile);
            const bufferClient = await this.findOne(canonicalMobile, false);
            if (!bufferClient) {
                throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing BufferClient with mobile: ${canonicalMobile}`);
            await sendBotNotice('notif', {
                severity: 'warning',
                title: 'Deleting buffer',
                fields: [
                    { label: 'Mobile', value: canonicalMobile },
                    { label: 'Reason', value: message || 'manual removal', code: false },
                ],
            });
            await this.bufferClientModel.deleteOne({ mobile: canonicalMobile }).exec();
        } catch (error) {
            const errorDetails = parseError(error, `failed to delete BufferClient: ${mobile}`);
            this.logger.error(`Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }

    async search(filter: SearchBufferClientDto): Promise<BufferClientDocument[]> {
        const query: BufferClientQuery = { ...filter };
        if (typeof query.mobile === 'string' && query.mobile) {
            query.mobile = this.canonicalMobile(query.mobile);
        }
        const regexFields = ['username', 'clientId'];
        for (const field of regexFields) {
            if (typeof query[field] === 'string' && query[field]) {
                query[field] = { $regex: new RegExp(query[field].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
            }
        }
        return await this.bufferClientModel.find(query).exec();
    }

    async executeQuery(query: object, sort?: Record<string, 1 | -1>, limit?: number, skip?: number): Promise<BufferClientDocument[]> {
        if (!query) {
            throw new BadRequestException('Query is invalid.');
        }
        try {
            const queryExec = this.bufferClientModel.find(query);
            if (sort) queryExec.sort(sort);
            if (limit) queryExec.limit(limit);
            if (skip) queryExec.skip(skip);
            return await queryExec.exec();
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new InternalServerErrorException(`Query execution failed: ${errorMessage}`);
        }
    }

    /**
     * Degraded swap tier 2: move a same-persona sibling's spare buffer to `toClientId`. Matches only
     * an active, not-in-use record still owned by `fromClientId`, so a buffer the sibling took in
     * the meantime is never stolen. Throws ConflictException when nothing matched.
     */
    async reassignClientId(mobile: string, fromClientId: string, toClientId: string, session?: ClientSession): Promise<void> {
        const result = await this.bufferClientModel.updateOne(
            { mobile, clientId: fromClientId, inUse: { $ne: true }, status: 'active' },
            { $set: { clientId: toClientId, message: `Reassigned from ${fromClientId} by degraded swap` } },
            session ? { session } : undefined,
        ).exec();
        if ((result.matchedCount || 0) !== 1) {
            throw new ConflictException(`Buffer ${mobile} is no longer a free spare of ${fromClientId}`);
        }
        this.logger.info(`Reassigned buffer ${mobile} from ${fromClientId} to ${toClientId} (degraded swap)`);
    }

    /**
     * Cross-process probe/connect lease on one buffer row, taken by setupClient runs only (HTTP and
     * the swap-maintenance job). Atomic: true only when the row had no lease, an expired one, or one
     * already held by `owner`. Two setupClient runs in different CMS processes therefore never probe or
     * connect the same session at once. Other paths that connect buffer sessions (warmup, health
     * checks, channel joins, updateClient...) do NOT read this lease; they rely on their own
     * in-process guards, as before (known limit, design doc "Safety").
     */
    async acquireProbeLease(mobile: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = new Date();
        const leased = await this.bufferClientModel.findOneAndUpdate(
            {
                mobile,
                $or: [
                    { probeLease: { $exists: false } },
                    { probeLease: null },
                    { 'probeLease.until': { $lte: now } },
                    { 'probeLease.owner': owner },
                ],
            },
            { $set: { probeLease: { owner, until: new Date(now.getTime() + ttlMs) } } },
            { projection: { _id: 1 } },
        ).lean().exec();
        return !!leased;
    }

    /** Extend every probe lease held by `owner` to `until` (a long setup run renews its leases). */
    async renewProbeLeases(owner: string, until: Date): Promise<void> {
        await this.bufferClientModel.updateMany({ 'probeLease.owner': owner }, { $set: { 'probeLease.until': until } }).exec();
    }

    /** Release probe leases held by `owner` (one mobile, or all of them). */
    async releaseProbeLeases(owner: string, mobile?: string): Promise<void> {
        await this.bufferClientModel.updateMany(
            { 'probeLease.owner': owner, ...(mobile ? { mobile } : {}) },
            { $unset: { probeLease: '' } },
        ).exec();
    }

    async setPrimaryInUse(clientId: string, mobile: string, session?: ClientSession): Promise<BufferClientDocument> {
        const now = new Date();
        // Verify the replacement exists BEFORE revoking the current primary. The partial
        // unique index on { clientId, inUse:true } forces an assign-after-revoke order, so
        // if we revoked first and the target turned out to be missing (e.g. recycled between
        // selection and cutover) we would throw NotFound after stranding the clientId with
        // ZERO in-use primaries. Guarding here keeps the old primary intact on failure.
        const existsQuery = this.bufferClientModel.exists({ mobile, clientId });
        if (session) existsQuery.session(session);
        const exists = await existsQuery;
        if (!exists) {
            throw new NotFoundException(`Primary buffer client ${mobile} for ${clientId} not found`);
        }
        const revoked = await this.bufferClientModel.updateMany(
            {
                clientId,
                mobile: { $ne: mobile },
                inUse: true,
            },
            {
                $set: {
                    inUse: false,
                    lastUsed: now,
                },
            },
            session ? { session } : undefined,
        ).exec();

        if ((revoked.modifiedCount || 0) > 0) {
            this.logger.info(`Revoked stale in-use buffer ownership for ${clientId}`, {
                keepMobile: mobile,
                revokedCount: revoked.modifiedCount,
            });
            // Do not perform an external bot call inside a Mongo transaction. The
            // transaction callback may retry, which would duplicate the notification.
            if (!session) await this.botsService.sendMessageByCategory(
                ChannelCategory.ACCOUNT_NOTIFICATIONS,
                {
                    severity: 'warning',
                    title: 'Primary changed',
                    fields: [
                        { label: 'Client ID', value: clientId },
                        { label: 'Primary mobile', value: mobile },
                        { label: 'Revoked in-use', value: revoked.modifiedCount, code: false },
                    ],
                },
            );
        }

        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate(
                { mobile, clientId },
                {
                    $set: {
                        inUse: true,
                        status: 'active',
                        lastUsed: now,
                    },
                },
                { returnDocument: 'after', ...(session ? { session } : {}) },
            )
            .exec();

        if (!updatedBufferClient) {
            throw new NotFoundException(`Primary buffer client ${mobile} for ${clientId} not found`);
        }

        this.logger.info(`Set primary in-use buffer client for ${clientId}`, {
            mobile,
        });
        return updatedBufferClient;
    }

    async refillJoinQueue(clientId?: string | null): Promise<number> {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) return 0;
        if (this.telegramService.hasActiveClientSetup()) return 0;

        this.resetDailyJoinCountersIfNeeded();
        const primaryClientMobiles = await this.getPrimaryClientMobiles(clientId);
        const excludedMobiles = new Set([
            ...this.joinChannelMap.keys(),
            ...primaryClientMobiles,
        ]);

        const query: BufferClientQuery = {
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(excludedMobiles) },
            ...this.getJoinCapacityEligibilityFilter(),
        };
        if (clientId) query.clientId = clientId;
        this.logger.debug('Refill join queue query prepared', {
            clientId: clientId || 'all',
            excludedCount: excludedMobiles.size,
        });

        // Sort descending: accounts closest to target (200) go first.
        // Finishing a near-complete account produces a ready account faster
        // than spreading joins across many low-channel accounts.
        const eligible = await this.findPrioritizedJoinCandidates(query);

        let added = 0;
        let leaveAdded = 0;
        for (const doc of eligible) {
            if (this.isPrimaryClientMobile(doc.mobile, primaryClientMobiles)) {
                this.logger.debug(`Skipping refill candidate ${doc.mobile}: it is the live client mobile`);
                continue;
            }
            if (this.isMobileDailyCapped(doc.mobile)) continue;
            // Hoisted so the catch can hand the live client to buildPermanentAccountReason.
            let client: TelegramManager | null = null;
            try {
                client = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
                const channels = await channelInfo(client.client, true);
                await this.update(doc.mobile, { channels: channels.ids.length });
                if (this.isTerminalOperationalAfterRefresh(doc, channels.ids.length)) continue;

                if (channels.canSendFalseCount < 10) {
                    const remaining = this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(doc.mobile);
                    const channelsToJoin = await this.fetchJoinCandidates(doc.mobile, channels.ids.length, remaining, this.getJoinedChannelIdsFromInfo(channels));
                    if (channelsToJoin.length === 0) continue;

                    if (this.safeSetJoinChannelMap(doc.mobile, channelsToJoin)) {
                        added++;
                    }
                } else if (!this.leaveChannelMap.has(doc.mobile)) {
                    if (this.queueLeaveChannelsIfAllowed(doc, channels.canSendFalseChats)) {
                        leaveAdded++;
                    }
                }
            } catch (error) {
                const errorDetails = parseError(error, `RefillJoinQueueErr: ${doc.mobile}`);
                if (isPermanentError(errorDetails)) {
                    // Pass the live client so freeze metadata (freeze_until_date / appeal_url) is
                    // captured; without it buildPermanentAccountReason short-circuits. Measured
                    // 2026-09-05: 0 of 433 frozen accounts had a freeze window recorded.
                    const reason = await this.buildPermanentAccountReason(errorDetails.message, client);
                    await this.deactivateClient(doc.mobile, reason, { permanent: true });
                }
            } finally {
                await this.safeUnregisterClient(doc.mobile);
            }
        }

        if (added > 0) {
            this.logger.log(`Refilled join queue with ${added} buffer clients`);
        }
        if (leaveAdded > 0 && !this.leaveChannelIntervalId) {
            this.createTimeout(() => this.leaveChannelQueue(), ClientHelperUtils.gaussianRandom(6500, 1000, 5000, 8000));
        }

        return added;
    }


    // ---- Buffer-specific: Enrollment (redesigned — no 2FA, no removeExternalLoginSessions, no createNewSession) ----

    /** Cross-process one-pool-per-mobile claim (shared/onboarding/pool-claim.ts); refuses while the other pool holds it. */
    private async withPoolClaimOrRefuse<T>(canonicalMobile: string, fn: () => Promise<T>): Promise<T> {
        const claim = await withPoolClaim(this.model, canonicalMobile, 'bufferClients', fn);
        if ('heldBy' in claim) {
            throw new BadRequestException(`Mobile ${canonicalMobile} is being enrolled in ${claim.heldBy} right now; refusing to create a cross-pool BufferClient`);
        }
        return claim.value;
    }

    async setAsBufferClient(
        mobile: string,
        clientId: string,
        availableDate: string = ClientHelperUtils.getTodayDateString()
    ) {
        const canonicalMobile = this.canonicalMobile(mobile);
        const user = (await this.usersService.search({ mobile: canonicalMobile, expired: false }))[0];
        if (!user) throw new BadRequestException('user not found');
        const sourceSession = user.session?.trim();
        if (!sourceSession) {
            throw new BadRequestException('User session missing; cannot create BufferClient');
        }

        const isExist = await this.findOne(canonicalMobile, false);
        if (isExist) throw new ConflictException('BufferClient already exist');

        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        if (clientMobiles.some((clientMobile) => this.mobilesMatch(clientMobile, canonicalMobile))) throw new BadRequestException('Number is an Active Client');

        // Cross-pool guard: refuse to enroll a mobile that already lives in the promote
        // pool. Running one account as BOTH a buffer and a promote client produces two
        // concurrent live sessions on one Telegram account => SESSION_REVOKED (permanent
        // account loss — the #1 operational risk). `create()` enforces this via
        // isMobileEnrolledAnywhere; this operator-facing path must too.
        if (await this.promoteClientService.existsByMobile(canonicalMobile)) {
            throw new BadRequestException(`Mobile ${canonicalMobile} is already enrolled in promoteClients; refusing to create a cross-pool BufferClient`);
        }

        const telegramClient = await connectionManager.getClient(canonicalMobile, { autoDisconnect: false });
        try {
            // Only get channel info — no 2FA, no profile changes, no new session
            const channels = await this.telegramService.getChannelInfo(canonicalMobile, true);
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

            const bufferClient: CreateBufferClientDto = {
                tgId: user.tgId,
                session: sourceSession, // Use old trusted session directly
                mobile: canonicalMobile,
                availableDate,
                channels: channels.ids.length,
                clientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };
            // Same per-mobile lock + re-check as auto-enrolment: a concurrent promote enrolment of
            // this mobile may have landed while we were on Telegram.
            await withEnrollmentLock(canonicalMobile, () => this.withPoolClaimOrRefuse(canonicalMobile, async () => {
                const already = await this.isMobileEnrolledAnywhere(canonicalMobile);
                if (already && already !== 'bufferClients') {
                    throw new BadRequestException(`Mobile ${canonicalMobile} is already enrolled in ${already}; refusing to create a cross-pool BufferClient`);
                }
                await this.bufferClientModel
                    .findOneAndUpdate({ mobile: canonicalMobile }, {
                        $set: {
                            ...bufferClient,
                            warmupPhase: WarmupPhase.ENROLLED,
                            warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                            enrolledAt: new Date(),
                        }
                    }, { returnDocument: 'after', upsert: true })
                    .exec();
            }));
        } catch (error) {
            const errorDetails = parseError(error, `Failed to set as Buffer Client ${canonicalMobile}`);
            // Retire permanently dead accounts at the source (cascades to pools)
            if (isPermanentError(errorDetails)) {
                try { await this.usersService.expireAccount(canonicalMobile, 'Permanent error during buffer enrollment'); } catch { }
            }
            throw new HttpException(errorDetails.message, errorDetails.status);
        } finally {
            await this.safeUnregisterClient(canonicalMobile);
        }
        return 'Client enrolled as buffer successfully';
    }

    // ---- Diagnostic: dry-run enrollment decision ----

    async diagnoseEnrollmentDecision(): Promise<Record<string, unknown>> {
        const clients = await this.clientService.findAll();
        const now = Date.now();

        const assignedBufferClients = await this.bufferClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();

        const plan = await this.buildBufferSupplyPlan(clients, now);
        const perClientDecisions: EnrollmentDecision[] = [];
        const allocations: Allocation[] = [];
        let totalSlotsNeeded = 0;
        for (const entry of plan.entries) {
            const availabilityNeeds = entry.availability;
            const remainingCapacity = Math.max(0, entry.cap - entry.counted);
            const decision: EnrollmentDecision = {
                clientId: entry.clientId,
                healthyCount: entry.counted,
                healthyCap: entry.cap,
                remainingCapacity,
                readyActive: availabilityNeeds.readyActive,
                warmingPipeline: availabilityNeeds.warmingPipeline,
                totalActive: availabilityNeeds.totalActive,
                totalNeeded: entry.need,
                calculationReason: entry.reason,
                priority: availabilityNeeds.priority,
                replenishmentWindows: availabilityNeeds.replenishmentWindowNeeds,
                shortTermWindows: availabilityNeeds.windowNeeds,
                supply: {
                    countedByKind: entry.countedByKind,
                    excluded: entry.excluded,
                    needsSpamCheck: entry.needsSpamCheck,
                    consumed: entry.consumed,
                    ratePerDay: entry.ratePerDay,
                    target: entry.target,
                    windowNeed: entry.windowNeed,
                },
                wouldEnroll: entry.allocated,
            };
            const wanted = Math.max(entry.windowNeed, plan.mode === 'dynamic' ? Math.max(0, entry.target - entry.counted) : 0);
            if (entry.allocated > 0) {
                decision.cappedReason = entry.allocated < entry.need
                    ? `capped from ${entry.need} to ${entry.allocated} by the fleet enrolment budget`
                    : entry.need < wanted ? `capped from ${wanted} to ${entry.need} by healthy cap` : null;
                allocations.push({ clientId: entry.clientId, allocated: entry.allocated, priority: entry.priority });
                totalSlotsNeeded += entry.allocated;
            } else if (wanted > 0 && remainingCapacity <= 0) {
                decision.blockedReason = `healthy cap reached (${entry.counted}/${entry.cap})`;
            } else if (entry.need > 0) {
                decision.blockedReason = `fleet enrolment budget exhausted (${plan.fleet.budget} this run)`;
            } else {
                decision.blockedReason = 'no deficit in replenishment windows';
            }
            perClientDecisions.push(decision);
        }
        const clientsNeedingBufferClients = plan.entries.filter((entry) => entry.need > 0);

        // Check eligible user pool
        const promoteClients = await this.promoteClientService.findAll();
        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferMobiles = assignedBufferClients.map((doc) => doc.mobile);
        const goodIds = [
            ...clientMainMobiles,
            ...promoteClients.map((c) => c.mobile),
            ...assignedBufferMobiles,
        ].filter((id): id is string => typeof id === 'string' && id.length > 0);

        const threeMonthsAgo = ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);
        const eligibleUserCount = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: threeMonthsAgo },
                totalChats: { $gt: 150 },
            },
            { _id: 1 },
            totalSlotsNeeded + 5,
        );

        return {
            maxNewClientsPerTrigger: this.config.maxNewClientsPerTrigger,
            minTotalClients: this.config.minTotalClients,
            healthyCapPerClient: plan.mode === 'legacy' ? LEGACY_HEALTHY_CAP : Object.fromEntries(plan.capPerClient),
            supplyMode: plan.mode,
            supplyConfig: plan.config,
            supplyConfigInvalid: plan.invalidConfig,
            fleetBudget: plan.fleet,
            totalClientsNeedingEnrollment: clientsNeedingBufferClients.length,
            totalSlotsRequested: clientsNeedingBufferClients.reduce((s, c) => s + c.need, 0),
            totalSlotsAllocated: totalSlotsNeeded,
            eligibleUsersAvailable: eligibleUserCount.length,
            wouldCreate: Math.min(totalSlotsNeeded, eligibleUserCount.length),
            allocations,
            perClientDecisions: perClientDecisions.sort((a, b) => b.totalNeeded - a.totalNeeded),
        };
    }

    // ---- Diagnostic: dry-run warmup pipeline ----

    async diagnoseWarmupPipeline(): Promise<Record<string, unknown>> {
        const clients = await this.clientService.findAll();
        const clientMap = new Map(clients.map((c) => [c.clientId, c]));
        const now = Date.now();

        const allActive = await this.bufferClientModel
            .find({ status: 'active', clientId: { $exists: true, $ne: null } })
            .exec();

        const phaseCounts: Record<string, number> = {};
        const actionCounts: Record<string, number> = {};
        const skippedReasons: Record<string, number> = {};
        const wouldProcess: WarmupDiagnosticEntry[] = [];
        const settlingDetails: WarmupDiagnosticEntry[] = [];

        for (const bc of allActive) {
            const warmupPhase = bc.warmupPhase || WarmupPhase.ENROLLED;
            phaseCounts[warmupPhase] = (phaseCounts[warmupPhase] || 0) + 1;

            const client = clientMap.get(bc.clientId);
            if (!client) { skippedReasons['no_client'] = (skippedReasons['no_client'] || 0) + 1; continue; }

            const lastUsed = ClientHelperUtils.getTimestamp(bc.lastUsed);
            if (lastUsed > 0 && warmupPhase === WarmupPhase.SESSION_ROTATED) {
                skippedReasons['session_rotated_used'] = (skippedReasons['session_rotated_used'] || 0) + 1;
                continue;
            }
            if (bc.mobile === client.mobile) {
                skippedReasons['is_primary_mobile'] = (skippedReasons['is_primary_mobile'] || 0) + 1;
                continue;
            }
            if (bc.inUse === true) {
                skippedReasons['in_use'] = (skippedReasons['in_use'] || 0) + 1;
                continue;
            }

            const failedAttempts = bc.failedUpdateAttempts || 0;
            const lastFailureTime = ClientHelperUtils.getTimestamp(bc.lastUpdateFailure);
            let processSkipReason: string | null = null;

            // Age never skips/retires an account (policy). The only non-cooldown skip is a recent
            // failure still within its retry backoff.
            if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
                const retryBackoffMs = this.FAILURE_RETRY_BACKOFF_HOURS * 60 * 60 * 1000;
                if (lastFailureTime > 0 && now - lastFailureTime < retryBackoffMs) {
                    processSkipReason = `failed_${failedAttempts}_backoff`;
                }
            }

            const warmupAction = getWarmupPhaseAction(bc, now, { operationalFloor: this.operationalFloor });
            const lastAttemptAge = bc.lastUpdateAttempt ? Math.round((now - new Date(bc.lastUpdateAttempt).getTime()) / (60 * 60 * 1000)) : null;

            const computedPhase = warmupAction.phase;
            const priority = calculateWarmupPriority(bc, warmupAction, now);

            actionCounts[warmupAction.action] = (actionCounts[warmupAction.action] || 0) + 1;

            const entry = {
                mobile: bc.mobile,
                dbPhase: warmupPhase,
                computedPhase,
                action: warmupAction.action,
                priority: Math.round(priority),
                failedAttempts,
                lastAttemptHoursAgo: lastAttemptAge,
                processSkipReason,
                privacyDone: !!bc.privacyUpdatedAt,
                twoFADone: !!bc.twoFASetAt,
                authsRemoved: !!bc.otherAuthsRemovedAt,
                channels: bc.channels || 0,
                onCooldown: this.isOnCooldown(bc.mobile, bc.lastUpdateAttempt, now),
            };

            if (warmupAction.phase === WarmupPhase.SETTLING) {
                settlingDetails.push(entry);
            }
            wouldProcess.push(entry);
        }

        wouldProcess.sort((a, b) => b.priority - a.priority);

        // Simulate processing loop with the SELF-HEALING effective cap (sized to the live
        // eligible backlog), matching what the real run does.
        const simEffectiveCap = this.getEffectiveUpdatesCap(wouldProcess.length);
        let simUpdates = 0;
        const simProcessed: WarmupSimulationEntry[] = [];
        const simSkipped: WarmupSimulationSkip[] = [];
        for (const entry of wouldProcess) {
            if (simUpdates >= simEffectiveCap) {
                simSkipped.push({ mobile: entry.mobile, action: entry.action, priority: entry.priority, reason: 'slot_limit_reached' });
                continue;
            }
            if (entry.onCooldown) {
                simSkipped.push({ mobile: entry.mobile, action: entry.action, reason: 'cooldown' });
                continue;
            }
            if (entry.processSkipReason) {
                simSkipped.push({ mobile: entry.mobile, action: entry.action, reason: entry.processSkipReason });
                continue;
            }
            const isMutation = !['wait', 'join_channels', 'advance_to_ready', 'organic_only'].includes(entry.action);
            simProcessed.push({
                mobile: entry.mobile,
                dbPhase: entry.dbPhase,
                computedPhase: entry.computedPhase,
                action: entry.action,
                priority: entry.priority,
                isMutation,
                wouldConsumeSlot: isMutation,
            });
            if (isMutation) simUpdates++;
        }

        return {
            totalActive: allActive.length,
            phaseCounts,
            actionCounts,
            skippedReasons,
            maxUpdatesPerCycle: this.MAX_UPDATES_PER_CYCLE,
            effectiveUpdatesCap: simEffectiveCap,
            capMin: this.MIN_UPDATES_PER_CYCLE,
            targetDrainDays: this.WARMUP_TARGET_DRAIN_DAYS,
            runsPerDay: this.WARMUP_RUNS_PER_DAY,
            eligibleToProcess: wouldProcess.length,
            simulation: {
                totalMutationSlots: simEffectiveCap,
                mutationsUsed: simUpdates,
                totalProcessed: simProcessed.length,
                totalSkippedAfterSlotLimit: simSkipped.filter(s => s.reason === 'slot_limit_reached').length,
                totalSkippedCooldown: simSkipped.filter(s => s.reason === 'cooldown').length,
                totalSkippedOther: simSkipped.filter(s => s.reason !== 'slot_limit_reached' && s.reason !== 'cooldown').length,
            },
            top30WouldProcess: simProcessed.slice(0, 30),
            settlingAccounts: {
                total: settlingDetails.length,
                byAction: settlingDetails.reduce((acc, s) => {
                    acc[s.action] = (acc[s.action] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>),
                sampleNeedingPrivacy: settlingDetails.filter(s => s.action === 'set_privacy').slice(0, 5),
                sampleNeedingRemoveAuths: settlingDetails.filter(s => s.action === 'remove_external_login_sessions').slice(0, 5),
            },
            skippedBySlotLimit: simSkipped.filter(s => s.reason === 'slot_limit_reached').slice(0, 10),
        };
    }

    // ---- Buffer-specific: Check & process buffer clients ----

    async checkBufferClients() {
        // Self-reentrancy only (no global lock — warmup may run alongside join/leave).
        if (this.isWarmupCheckProcessing) {
            this.logger.warn('Skipping checkBufferClients: a warmup check is already running');
            return;
        }
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return;
        }
        this.isWarmupCheckProcessing = true;
        try {
            // One run = one summary message: per-mobile warmup/enrol events are collected and sent
            // inside the summary; anything left over (a crashed run) goes out here.
            await runWithNoticeBatch(async (batch) => {
                try {
                    await this._checkBufferClientsInternal();
                } finally {
                    await this.flushLeftoverNoticeBatch(batch, 'Buffer warmup run (summary not reached)');
                }
            });
        } catch (error) {
            const errMsg = parseError(error, 'checkBufferClients').message;
            this.logger.error(`checkBufferClients crashed: ${errMsg}`);
            try { await sendBotNotice('notif', { severity: 'error', title: 'Check crashed', fields: [{ label: 'Pool', value: 'buffer', code: false }], summary: errMsg.slice(0, 200), details: errMsg.length > 200 ? errMsg : undefined, detailsTitle: 'Error message' }); } catch { /* best effort */ }
        } finally {
            this.isWarmupCheckProcessing = false;
        }
    }

    /**
     * Rotates only accounts which the normal warmup pass has already marked READY.
     * Checks and setup remain serialized; joins/leaves may proceed for other
     * mobiles because terminal phases are excluded from their candidate queries.
     */
    async rotateReadyBufferClients(): Promise<boolean> {
        if (this.readyRotationInProgress) {
            this.logger.warn('Ready buffer rotation skipped: another ready rotation is already running');
            return false;
        }
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ready buffer rotation skipped: active client setup exists');
            return false;
        }
        // Skip rotation while a warmup check is editing account state — rotating a session
        // mid-warmup-edit on the same account is the one same-session concern worth avoiding.
        // (Join/leave may overlap rotation: terminal phases are excluded from join queries.)
        if (this.isWarmupCheckProcessing) {
            this.logger.warn('Ready buffer rotation skipped: warmup check is active');
            return false;
        }

        this.readyRotationInProgress = true;
        try {
            const clients = await this.clientService.findAll();
            const clientMap = new Map(clients.map((client) => [client.clientId, client]));
            const primaryClientMobiles = new Set(
                clients.filter((client) => !!client.mobile).map((client) => client.mobile),
            );
            const readyClients = await this.bufferClientModel
                .find({
                    clientId: { $exists: true, $ne: null },
                status: 'active',
                inUse: { $ne: true },
                warmupPhase: WarmupPhase.READY,
                ...this.getOperationalChannelEligibilityFilter(),
                })
                .sort({ lastUpdateAttempt: 1, mobile: 1 })
                .exec();

            const { attempted, rotated, deferred, skipped } = await this.processReadyRotationSweep(
                readyClients,
                clientMap,
                (bufferClient) => this.isPrimaryClientMobile(bufferClient.mobile, primaryClientMobiles)
                    || this.joinChannelMap.has(bufferClient.mobile)
                    || this.leaveChannelMap.has(bufferClient.mobile),
            );

            this.logger.log(
                `Ready buffer rotation sweep complete: candidates=${readyClients.length}, attempted=${attempted}, rotated=${rotated}, deferred=${deferred}, skipped=${skipped}`,
            );
            return attempted > 0;
        } catch (error) {
            const errMsg = parseError(error, 'rotateReadyBufferClients').message;
            this.logger.error(`Ready buffer rotation sweep crashed: ${errMsg}`);
            try { await sendBotNotice('notif', { severity: 'error', title: 'Rotation crashed', fields: [{ label: 'Pool', value: 'buffer', code: false }], summary: errMsg.slice(0, 200), details: errMsg.length > 200 ? errMsg : undefined, detailsTitle: 'Error message' }); } catch { /* best effort */ }
            return false;
        } finally {
            this.readyRotationInProgress = false;
        }
    }

    private async _checkBufferClientsInternal() {
        const clients = await this.clientService.findAll();
        const promoteClients = await this.promoteClientService.findAll();
        const clientMap = new Map(clients.map((client) => [client.clientId, client]));
        const now = Date.now();

        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferClients = await this.bufferClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();
        // Exclude ALL buffer client mobiles (not just active) from candidate pool to prevent re-enrollment
        const allBufferClientMobiles = (await this.bufferClientModel.find({}, { mobile: 1 }).lean().exec()).map((doc) => doc.mobile);

        const goodIds = buildEnrolmentExclusions(clientMainMobiles, promoteClients.map((c) => c.mobile), allBufferClientMobiles);

        let totalUpdates = 0;
        const updatedEntries: CheckEntry[] = [];
        this.logger.debug(`Checking buffer clients, good IDs count: ${goodIds.length}`);

        // Collect buffer clients for priority-sorted processing. The warmupAction is computed ONCE
        // here and carried through — the priority sort, the sensitive precheck, and the organic
        // precheck all reuse it instead of recomputing (which was done 3× per account and risked a
        // TOCTOU mismatch between the precheck action and what processClient actually did).
        const bufferClientsToProcess: Array<{
            bufferClient: BufferClientDocument;
            client: Client;
            clientId: string;
            priority: number;
            warmupAction: ReturnType<typeof getWarmupPhaseAction>;
        }> = [];

        for (const bufferClient of assignedBufferClients) {
            if (!bufferClient.clientId) continue;
            const client = clientMap.get(bufferClient.clientId);
            if (!client) continue;
            if (bufferClient.mobile === client.mobile) {
                this.logger.debug(`Skipping buffer maintenance for ${bufferClient.mobile}: currently attached as primary client mobile`);
                continue;
            }
            if (bufferClient.inUse === true) continue;

            const lastUpdateAttempt = bufferClient.lastUpdateAttempt ? new Date(bufferClient.lastUpdateAttempt).getTime() : 0;
            if (this.isOnCooldown(bufferClient.mobile, bufferClient.lastUpdateAttempt, now)) continue;

            const warmupPhase = bufferClient.warmupPhase;
            if (!warmupPhase) {
                this.logger.warn(`Skipping buffer client ${bufferClient.mobile}: incomplete lifecycle metadata`);
                continue;
            }
            // READY -> SESSION_ROTATED is deliberately handled only by the paced
            // ready-rotation scheduler. A normal maintenance run must never turn
            // a catch-up batch into a burst of sensitive session work.
            if (warmupPhase === WarmupPhase.READY) continue;
            // Use the COMPUTED warmup phase for priority so that enrolled accounts
            // whose state machine already says "settling" get the same priority as
            // DB-settling accounts — prevents permanent starvation of newer accounts.
            const warmupAction = getWarmupPhaseAction(bufferClient, now, { operationalFloor: this.operationalFloor });
            const priority = calculateWarmupPriority(bufferClient, warmupAction, now);

            bufferClientsToProcess.push({ bufferClient, client, clientId: bufferClient.clientId, priority, warmupAction });
        }

        // Sort by priority (highest first)
        bufferClientsToProcess.sort((a, b) => b.priority - a.priority);

        // Self-healing cap: size this run's mutation budget to the live pending backlog so the
        // pool drains toward the target SLA — grows when starved, shrinks when caught up.
        const effectiveCap = this.getEffectiveUpdatesCap(bufferClientsToProcess.length);
        let sensitiveUpdates = 0; // separate, tighter budget for high-risk actions (anti-detection)
        let organicUpdates = 0;   // separate budget so organic no-ops can't monopolize the run
        this.logger.log(`Buffer warmup run: ${bufferClientsToProcess.length} eligible, effective cap=${effectiveCap} (ceiling ${this.MAX_UPDATES_PER_CYCLE}), sensitive sub-cap=${this.MAX_SENSITIVE_ACTIONS_PER_CYCLE}, organic sub-cap=${this.MAX_ORGANIC_ACTIONS_PER_CYCLE}`);

        // Process in priority order using base class processClient
        for (const { bufferClient, client, warmupAction } of bufferClientsToProcess) {
            if (totalUpdates >= effectiveCap) break;
            const warmupPhase = bufferClient.warmupPhase || WarmupPhase.ENROLLED;
            if (warmupPhase === WarmupPhase.SESSION_ROTATED) {
                const lastChecked = bufferClient.lastChecked ? new Date(bufferClient.lastChecked).getTime() : 0;
                const healthCheck = await this.performHealthCheck(bufferClient.mobile, lastChecked, now);
                if (!healthCheck.passed) continue;
            }
            const plannedAction = warmupAction.action; // computed once above; reused here

            // Organic sub-cap: organic_only makes no phase progress but costs a ~20s TG session.
            // Once the run has done its organic quota, skip further organic accounts so the
            // remaining time/budget goes to accounts with a REAL mutation waiting. Skipped accounts
            // keep their lastUpdateAttempt untouched, so they stay eligible for the next run.
            if (plannedAction === 'organic_only' && organicUpdates >= this.MAX_ORGANIC_ACTIONS_PER_CYCLE) {
                continue;
            }

            // Anti-detection sub-cap: keep high-risk actions (2FA/remove_auths/username) sparse per
            // run. If this account's next action is sensitive and we've hit the sub-cap, defer it to
            // a later run (it stays high-priority) rather than clustering risky actions on one IP.
            const plannedSensitive = this.isSensitiveWarmupAction(plannedAction);
            if (plannedSensitive && sensitiveUpdates >= this.MAX_SENSITIVE_ACTIONS_PER_CYCLE) {
                continue;
            }

            // Count the PLANNED sensitive action against the sub-cap now that we're committing to
            // invoke it — a failed sensitive action (updateCount 0) still consumed a risky attempt
            // on this IP, so it must count. (Previously the cap only saw succeeded actions, letting
            // a run retry unbounded sensitive actions after failures.)
            if (plannedSensitive) sensitiveUpdates++;
            if (plannedAction === 'organic_only') organicUpdates++;

            const processResult = await this.processClient(bufferClient, client, warmupAction);
            if (processResult.updateCount > 0) {
                totalUpdates += processResult.updateCount;
                updatedEntries.push({ clientId: client.clientId, mobile: bufferClient.mobile, change: processResult.updateSummary || 'updated', count: processResult.updateCount });
            }
        }

        // Supply-follows-demand enrolment (docs/design/2026-10-24-dynamic-buffer-supply.md). The plan
        // is computed after warmup so it sees this run's phase changes; it logs every client's
        // counted / excluded / target / need and the fleet engine budget.
        const supplyPlan = await this.buildBufferSupplyPlan(clients, now);
        this.logBufferSupplyPlan(supplyPlan);
        const clientNeedingBufferClients = supplyPlan.entries
            .filter((entry) => entry.allocated > 0)
            .map((entry) => ({
                clientId: entry.clientId,
                ...entry.availability,
                totalNeeded: entry.allocated,
                calculationReason: entry.reason,
                priority: entry.priority,
            }));
        const totalSlotsNeeded = clientNeedingBufferClients.reduce((sum, entry) => sum + entry.totalNeeded, 0);

        let dynamicCreateResult: { createdCount: number; attemptedCount: number; createdEntries: CheckEntry[] } = {
            createdCount: 0,
            attemptedCount: 0,
            createdEntries: [],
        };
        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            try {
                dynamicCreateResult = await this.addNewUserstoBufferClientsDynamic([], goodIds, clientNeedingBufferClients, supplyPlan.countedPerClient, supplyPlan.capPerClient);
            } catch (error) {
                const errMsg = parseError(error, 'addNewUserstoBufferClientsDynamic').message;
                this.logger.error(`Dynamic buffer enrollment failed: ${errMsg}`);
                try { await sendBotNotice('notif', { severity: 'warning', title: 'Enroll failed', fields: [{ label: 'Pool', value: 'buffer', code: false }], summary: errMsg.slice(0, 200), details: errMsg.length > 200 ? errMsg : undefined, detailsTitle: 'Error message' }); } catch { /* best effort */ }
            }
        }

        await this.sendBufferCheckSummaryNotification(
            totalUpdates,
            dynamicCreateResult.createdCount,
            dynamicCreateResult.attemptedCount,
            updatedEntries,
            dynamicCreateResult.createdEntries,
            supplyPlan,
        );
    }

    // ---- Buffer-specific: updateInfo ----

    async updateInfo() {
        // The live client mobiles are excluded in the query (not counted toward the 25).
        const primaryClientMobiles = await this.getPrimaryClientMobiles();
        await this.runPeriodicHealthChecks(primaryClientMobiles);
    }

    // ---- Buffer-specific: Channel joining entry point ----

    async joinchannelForBufferClients(skipExisting: boolean = true, clientId?: string): Promise<string> {
        if (this.telegramService.hasActiveClientSetup()) {
            return 'Active client setup exists, skipping';
        }
        // Don't destroy in-flight joins — skip if still processing
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) {
            this.logger.warn('Join/leave processing still in progress, skipping re-entry');
            return 'Join/leave still processing, skipped';
        }
        // Dedicated prepare-join reentrancy guard (replaces the old global lock): two concurrent
        // prepare sweeps (cron + API/manual) must not overlap.
        if (this.isPrepareJoinChannelsProcessing) {
            return 'Join-channel prepare already running, skipped';
        }
        this.isPrepareJoinChannelsProcessing = true;

        this.logger.log('Starting join channel process for buffer clients');
        try {
            // Store clientId scope so refills stay within the same client
            this.joinScopeClientId = clientId || null;

        const primaryClientMobiles = await this.getPrimaryClientMobiles(clientId);
        const preservedMobiles = await this.prepareJoinChannelRefresh(skipExisting);
        const query: BufferClientQuery = {
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(new Set([...preservedMobiles, ...primaryClientMobiles])) },
            status: 'active',
            ...this.getJoinCapacityEligibilityFilter(),
        };
        if (clientId) query.clientId = clientId;
        this.logger.info('Prepared buffer join-channel sweep', {
            clientId: clientId || 'all',
            preservedCount: preservedMobiles.size,
            primaryClientCount: primaryClientMobiles.size,
        });

        const clients = await this.findPrioritizedJoinCandidates(query);

        const joinSet = new Set<string>();
        const leaveSet = new Set<string>();
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < clients.length; i++) {
            const document = clients[i];
            const mobile = document.mobile;
            // Same guard as refillJoinQueue: a capped mobile can't join today, so don't connect it.
            if (this.isMobileDailyCapped(mobile)) continue;
            // Hoisted so the catch can hand the live client to buildPermanentAccountReason.
            let client: TelegramManager | null = null;

            try {
                client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                const channels = await channelInfo(client.client, true);
                await this.update(mobile, { channels: channels.ids.length });
                if (this.isTerminalOperationalAfterRefresh(document, channels.ids.length)) {
                    successCount++;
                    continue;
                }

                if (channels.canSendFalseCount < 10) {
                    const excludedIds = this.getJoinedChannelIdsFromInfo(channels);
                    // activeChannels below 220, channels above; skips pending join requests, approval-only last.
                    const remaining = this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(mobile);
                    const result = await this.fetchJoinCandidates(mobile, channels.ids.length, remaining, excludedIds);

                    if (!this.joinChannelMap.has(mobile)) {
                        if (this.safeSetJoinChannelMap(mobile, result)) {
                            joinSet.add(mobile);
                        }
                    }
                    // No session creation during warmup — use existing old session
                } else {
                    if (!this.leaveChannelMap.has(mobile)) {
                        if (this.queueLeaveChannelsIfAllowed(document, channels.canSendFalseChats)) {
                            leaveSet.add(mobile);
                        }
                    }
                }
                successCount++;
            } catch (error) {
                failCount++;
                const errorDetails = parseError(error, `JoinChannelErr: ${mobile}`);
                if (isPermanentError(errorDetails)) {
                    // Pass the live client so the freeze window is captured — see refillJoinQueue.
                    const reason = await this.buildPermanentAccountReason(errorDetails.message, client);
                    await this.deactivateClient(mobile, reason, { permanent: true });
                }
            } finally {
                await this.safeUnregisterClient(mobile);
                if (i < clients.length - 1) {
                    await sleep(ClientHelperUtils.gaussianRandom(this.config.clientProcessingDelay + 2500, 1500, this.config.clientProcessingDelay, this.config.clientProcessingDelay + 5000));
                }
            }
        }

        await sleep(ClientHelperUtils.gaussianRandom(7500, 750, 6000, 9000));

        if (joinSet.size > 0) {
            this.createTimeout(() => this.joinChannelQueue(), 4000 + Math.random() * 2000);
        }
        if (leaveSet.size > 0) {
            this.createTimeout(() => this.leaveChannelQueue(), ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
        }

            return `Buffer Join queued for: ${joinSet.size}, Leave queued for: ${leaveSet.size}`;
        } finally {
            this.isPrepareJoinChannelsProcessing = false;
        }
    }

    // ---- Buffer-specific: Create buffer client from user (redesigned — no removeExternalLoginSessions, no 2FA, no new session) ----

    /**
     * Check if a mobile is already enrolled in any collection (buffer, promote, or active client).
     * Returns the collection name if found, null otherwise.
     */
    private async isMobileEnrolledAnywhere(mobile: string): Promise<string | null> {
        const [bufferExists, promoteExists, clientExists] = await Promise.all([
            this.existsByMobile(mobile),
            this.promoteClientService.existsByMobile(mobile),
            this.clientService.findAll().then((clients) => clients.some((c) => this.mobilesMatch(c.mobile, mobile))),
        ]);
        if (bufferExists) return 'bufferClients';
        if (promoteExists) return 'promoteClients';
        if (clientExists) return 'clients';
        return null;
    }

    private async createBufferClientFromUser(
        document: { mobile: string; tgId: string },
        targetClientId: string,
        availableDate?: string
    ): Promise<boolean> {
        return enrolPoolClientFromUser(this.enrolmentPort(), document, targetClientId, availableDate);
    }

    /** Bound view of this service for the shared enrolment pipeline (shared/onboarding/enrolment.ts). */
    private enrolmentPort(): EnrolmentPort {
        return {
            profile: BUFFER_PROFILE,
            model: this.model,
            logger: this.logger,
            usersService: this.usersService,
            canonicalMobile: (mobile) => this.canonicalMobile(mobile),
            isMobileEnrolledAnywhere: (mobile) => this.isMobileEnrolledAnywhere(mobile),
            updateUser2FAStatus: (tgId, mobile) => this.updateUser2FAStatus(tgId, mobile),
            sendAccountNotice: (input) => this.sendAccountNotice(input),
            handleError: (error, context, mobile) => this.handleError(error, context, mobile),
            safeUnregisterClient: (mobile) => this.safeUnregisterClient(mobile),
            docExtras: () => ({}),
        };
    }

    // ---- Buffer-specific: Pool management ----

    async addNewUserstoBufferClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingBufferClients: string[] = [],
        _bufferClientsPerClient?: Map<string, number>,
    ) {
        // Manual bulk enrol uses the same supply plan as the scheduled run, restricted to the
        // requested clients: dynamic per-client cap counted from the live pool + fleet engine
        // budget (tracker D10). It used to cap at a fixed 20 counted from 0, with no budget.
        const plan = await this.buildBufferSupplyPlan(clientsNeedingBufferClients.map((clientId) => ({ clientId })));
        this.logBufferSupplyPlan(plan);
        const needs = plan.entries
            .filter((entry) => entry.allocated > 0)
            .map((entry) => ({
                clientId: entry.clientId,
                ...entry.availability,
                totalNeeded: entry.allocated,
                calculationReason: entry.reason,
                priority: entry.priority,
            }));
        if (needs.length === 0) return;
        await this.addNewUserstoBufferClientsDynamic(badIds, goodIds, needs, plan.countedPerClient, plan.capPerClient);
    }

    async addNewUserstoBufferClientsDynamic(
        badIds: string[],
        goodIds: string[],
        clientsNeedingBufferClients: Array<{
            clientId: string;
            totalNeeded: number;
            windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
            totalActive: number;
            totalNeededForCount: number;
            calculationReason: string;
            priority: number;
        }>,
        bufferClientsPerClient?: Map<string, number>,
        capPerClient?: Map<string, number>,
    ): Promise<{ createdCount: number; attemptedCount: number; createdEntries: CheckEntry[] }> {
        return runEnrolmentBatch({
            label: 'buffer',
            logger: this.logger,
            usersService: this.usersService,
            goodIds,
            needs: clientsNeedingBufferClients,
            countedPerClient: bufferClientsPerClient,
            capFor: (clientId) => capPerClient?.get(clientId) ?? this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT,
            maxNewPerRun: this.config.maxNewClientsPerTrigger,
            inactiveSince: ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS),
            enrolOne: (document, clientId, availableDate) => this.createBufferClientFromUser(document, clientId, availableDate),
        });
    }

    // ---- Buffer-specific: Distribution stats ----

    async getBufferClientsByClientId(clientId: string, status?: string): Promise<BufferClientDocument[]> {
        const filter: BufferClientQuery = { clientId };
        if (status) filter.status = status;
        return this.bufferClientModel.find(filter).exec();
    }

    async getBufferClientDistribution(): Promise<{
        totalBufferClients: number;
        unassignedBufferClients: number;
        activeBufferClients: number;
        inactiveBufferClients: number;
        distributionPerClient: Array<{
            clientId: string;
            assignedCount: number;
            activeCount: number;
            inactiveCount: number;
            needed: number;
            status: 'sufficient' | 'needs_more';
            neverUsed: number;
            usedInLast24Hours: number;
        }>;
        summary: {
            clientsWithSufficientBufferClients: number;
            clientsNeedingBufferClients: number;
            totalBufferClientsNeeded: number;
            maxBufferClientsPerTrigger: number;
            triggersNeededToSatisfyAll: number;
        };
    }> {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);

        const [
            totalBufferClients, unassignedBufferClients, activeBufferClients, inactiveBufferClients,
            assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts,
        ] = await Promise.all([
            this.bufferClientModel.countDocuments(),
            this.bufferClientModel.countDocuments({ clientId: { $exists: false } }),
            this.bufferClientModel.countDocuments({ status: 'active' }),
            this.bufferClientModel.countDocuments({ status: 'inactive' }),
            this.bufferClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null } } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.bufferClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'active' } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.bufferClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.bufferClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'active', $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }] } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.bufferClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'active', lastUsed: { $gte: last24Hours } } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
        ]);

        const toMap = (arr: ClientCount[]) => new Map(arr.map((item) => [item._id, item.count]));
        const assignedCountMap = toMap(assignedCounts);
        const activeCountMap = toMap(activeCounts);
        const inactiveCountMap = toMap(inactiveCounts);
        const neverUsedCountMap = toMap(neverUsedCounts);
        const recentlyUsedCountMap = toMap(recentlyUsedCounts);

        const distributionPerClient = [];
        let clientsWithSufficient = 0, clientsNeedingMore = 0, totalNeeded = 0;

        for (const client of clients) {
            const activeCount = activeCountMap.get(client.clientId) || 0;
            const needed = Math.max(0, this.config.minTotalClients - activeCount);
            distributionPerClient.push({
                clientId: client.clientId,
                assignedCount: assignedCountMap.get(client.clientId) || 0,
                activeCount,
                inactiveCount: inactiveCountMap.get(client.clientId) || 0,
                needed,
                status: (needed === 0 ? 'sufficient' : 'needs_more') as 'sufficient' | 'needs_more',
                neverUsed: neverUsedCountMap.get(client.clientId) || 0,
                usedInLast24Hours: recentlyUsedCountMap.get(client.clientId) || 0,
            });
            if (needed === 0) clientsWithSufficient++; else { clientsNeedingMore++; totalNeeded += needed; }
        }

        return {
            totalBufferClients, unassignedBufferClients, activeBufferClients, inactiveBufferClients,
            distributionPerClient,
            summary: {
                clientsWithSufficientBufferClients: clientsWithSufficient,
                clientsNeedingBufferClients: clientsNeedingMore,
                totalBufferClientsNeeded: totalNeeded,
                maxBufferClientsPerTrigger: this.config.maxNewClientsPerTrigger,
                triggersNeededToSatisfyAll: Math.ceil(totalNeeded / this.config.maxNewClientsPerTrigger),
            },
        };
    }

    async getBufferClientsByStatus(status: ClientStatusType): Promise<BufferClient[]> {
        return this.bufferClientModel.find({ status }).exec();
    }

    async getBufferClientsWithMessages() {
        return this.bufferClientModel.find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 }).exec();
    }

    /** Live-assignment selection must skip harsh / still-limited buffers. */
    protected getExtraAvailabilityFilter(): Record<string, unknown> {
        return buildSpamEligibleFilter();
    }

    /**
     * Replenishment must count what a swap can actually use (same rule as buildSpamEligibleFilter):
     * a harsh account checked within HARSH_RECHECK_AFTER_MS is not supply; a limited one counts only
     * from the day its limit lifts.
     */
    protected adjustSupplyDateForPoolState(doc: unknown, date: string | null, now: number): string | null {
        if (!date) return date;
        const spam = doc as { spamStatus?: string; limitedUntil?: Date | string | null; spamCheckedAt?: Date | string | null };
        if (spam.spamStatus === 'harsh') {
            const checkedAt = spam.spamCheckedAt ? new Date(spam.spamCheckedAt).getTime() : NaN;
            if (Number.isFinite(checkedAt) && now - checkedAt < HARSH_RECHECK_AFTER_MS) return null;
        }
        const until = spam.limitedUntil ? new Date(spam.limitedUntil).getTime() : NaN;
        if (Number.isFinite(until) && until > now) {
            const liftDate = ClientHelperUtils.toDateString(until);
            return liftDate > date ? liftDate : date;
        }
        return date;
    }

    async getLeastRecentlyUsedBufferClients(clientId: string, limit: number = 1): Promise<BufferClient[]> {
        return await this.getLeastRecentlyUsedClients(clientId, limit) as BufferClient[];
    }

    async getNextAvailableBufferClient(clientId: string): Promise<BufferClientDocument | null> {
        const clients = await this.getLeastRecentlyUsedBufferClients(clientId, 1);
        return clients.length > 0 ? clients[0] as BufferClientDocument : null;
    }

    async getUnusedBufferClients(hoursAgo: number = 24, clientId?: string): Promise<BufferClientDocument[]> {
        return await this.getUnusedClients(hoursAgo, clientId) as BufferClientDocument[];
    }

    private async sendBufferCheckSummaryNotification(
        totalUpdates: number,
        createdCount: number,
        attemptedCount: number,
        updatedEntries: CheckEntry[],
        createdEntries: CheckEntry[],
        supplyPlan?: BufferSupplyPlan,
    ): Promise<void> {
        const distribution = await this.getBufferClientDistribution();
        const summary = buildCheckSummaryNotification({
                kind: 'Buffer',
                active: distribution.activeBufferClients,
                inactive: distribution.inactiveBufferClients,
                unassigned: distribution.unassignedBufferClients,
                totalUpdates,
                createdCount,
                attemptedCount,
                totalNeeded: distribution.summary.totalBufferClientsNeeded,
                clientsNeedingMore: distribution.summary.clientsNeedingBufferClients,
                perClient: distribution.distributionPerClient,
                updatedEntries,
                createdEntries,
                perClientLimit: 10,
            });
        const supplyTable = supplyPlan ? this.buildSupplyPlanTable(supplyPlan) : null;
        if (supplyTable) (summary.tables ??= []).push(supplyTable);
        const eventsTable = eventsToTable(currentNoticeBatch()?.drain() ?? [], 'Events');
        if (eventsTable) (summary.tables ??= []).push(eventsTable);
        await sendNoticeBatched(
            (input) => this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, input, undefined, false),
            summary,
        );
    }

    /** Per-client supply audit for the run summary: what counted, what was excluded and why, the target and the enrolment. */
    buildSupplyPlanTable(plan: BufferSupplyPlan): { title: string; columns: string[]; rows: string[][] } | null {
        if (!plan.entries.length) return null;
        const rows = plan.entries.map((e) => [
            e.clientId,
            `${e.counted} (${e.countedByKind.usable}f/${e.countedByKind.limited_soon}l/${e.countedByKind.pipeline}w)`,
            String(e.excluded.harsh || 0),
            String((e.excluded.never_checked || 0) + (e.excluded.stale_free || 0)),
            String(e.consumed),
            `${e.target}/${e.cap}`,
            String(e.need),
            String(e.allocated),
        ]);
        const fleet = plan.fleet;
        const budgetNote = plan.mode === 'legacy'
            ? `legacy${plan.invalidConfig.length ? `, bad config: ${plan.invalidConfig.join(',')}` : ''}`
            : `budget ${fleet.budget}, 7d enrolled ${fleet.enrolledLast7d}/${fleet.weeklyCeiling}, warming ${fleet.fleetWarming}/${fleet.pipelineCapacity}`;
        return {
            title: `Supply plan (${budgetNote})`,
            columns: ['Client', 'Counted f/l/w', 'Harsh', 'Unchecked', 'Swaps', 'Target/Cap', 'Need', 'Enrol'],
            rows,
        };
    }
}
