import { ChannelsService } from '../channels/channels.service';
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
import { Model } from 'mongoose';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import {
    PromoteClient,
    PromoteClientDocument,
} from './schemas/promote-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { Api } from 'telegram';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { UpdatePromoteClientDto } from './dto/update-promote-client.dto';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { parseError } from '../../utils/parseError';
import { buildCheckSummaryNotification, type CheckEntry } from '../shared/check-summary-notification';
import { sendBotNotice } from '../../utils/bot-notice';
import { currentNoticeBatch, eventsToTable, runWithNoticeBatch, sendNoticeBatched } from '../../utils/notice-batch';
import { connectionManager } from '../Telegram/utils/connection-manager';
import TelegramManager from '../Telegram/TelegramManager';
import { SessionService } from '../session-manager';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import { Client } from '../clients/schemas/client.schema';
import isPermanentError from '../../utils/isPermanentError';
import { PersonaPool, PersonaAssignment, generateCandidateCombinations, personaKey } from '../../utils/persona-assignment';
import { nameMatchesAssignment, lastNameMatches } from '../../utils/homoglyph-normalizer';
import { BotsService, ChannelCategory } from '../bots';
import {
    BaseClientUpdate,
    BaseClientService,
    ClientStatusType,
    ClientConfig,
    performOrganicActivity,
    WarmupPhase,
    getWarmupPhaseAction,
    calculateWarmupPriority,
} from '../shared/base-client.service';
import { Channel } from '../channels/schemas/channel.schema';
import { ActiveChannel } from '../active-channels';
import { ClientHelperUtils } from '../shared/client-helper.utils';
import { withEnrollmentLock } from '../shared/enrollment-lock';
import { withPoolClaim } from '../shared/onboarding/pool-claim';
import { PROMOTE_PROFILE, isHealthyForLegacyCap } from '../shared/onboarding/pool-profile';
import { enrolPoolClientFromUser, type EnrolmentPort } from '../shared/onboarding/enrolment';
import { setAsPoolClient, type SetAsPort } from '../shared/onboarding/set-as';
import { buildEnrolmentExclusions, runEnrolmentBatch, type ClientEnrolmentNeed } from '../shared/onboarding/candidate-source';
import { computeFleetEnrollmentBudget, engineWeeklyCeiling, type FleetBudget } from '../buffer-clients/buffer-supply';

/** Same lead time as buffer's default (BUFFER_SUPPLY_LEAD_TIME_DAYS default 30). */
const PROMOTE_ENROLMENT_LEAD_TIME_DAYS = 30;

type ClientCount = { _id: string; count: number };
type PromoteClientQuery = Record<string, unknown>;

@Injectable()
export class PromoteClientService extends BaseClientService<PromoteClientDocument> {
    private readonly MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT = PROMOTE_PROFILE.legacyHealthyCap;
    private readyRotationInProgress = false;

    /** @deprecated Test compatibility alias: now reflects the warmup-check reentrancy flag
     *  (the global maintenance lock was removed). >0 means a warmup check is in progress. */
    private get checkingPromoteClientsSince(): number {
        return this.isWarmupCheckProcessing ? 1 : 0;
    }

    private set checkingPromoteClientsSince(value: number) {
        this.isWarmupCheckProcessing = value > 0;
    }

    private bufferClientService: BufferClientService;

    constructor(
        @InjectModel(PromoteClient.name)
        private promoteClientModel: Model<PromoteClientDocument>,
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
        @Inject(forwardRef(() => BufferClientService))
        bufferClientServiceRef: BufferClientService,
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
            PromoteClientService.name,
        );
        this.bufferClientService = bufferClientServiceRef;
        this.joinRequestModel = joinRequestModel;
    }

    // ---- Abstract implementations ----

    get model(): Model<PromoteClientDocument> {
        return this.promoteClientModel;
    }

    get clientType(): 'promote' {
        return 'promote';
    }

    get config(): ClientConfig {
        return {
            joinChannelInterval: 6 * 60 * 1000,       // Increased from 4min to 6min
            leaveChannelInterval: PROMOTE_PROFILE.pacing.leaveChannelIntervalMs, // 1 minute (owner-gated Q3)
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,              // 120s (redesigned from 10s)
            channelTarget: PROMOTE_PROFILE.channelTarget, // Must exceed promote mobile selection threshold (230)
            maxJoinsPerSession: 12,
            maxNewClientsPerTrigger: PROMOTE_PROFILE.maxNewClientsPerTrigger,
            minTotalClients: PROMOTE_PROFILE.minTotalClients,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: PROMOTE_PROFILE.pacing.clientProcessingDelayMs, // 8s between clients (owner-gated Q3)
            maxChannelJoinsPerDay: 25,
            joinsPerMobilePerRound: 4,
            // promote-clients selects runtime mobiles at >=230 channels.
            operationalChannelThreshold: PROMOTE_PROFILE.operationalFloor,
        };
    }

    private isHealthyPromoteClientForCap(doc: Partial<PromoteClientDocument>, _now: number): boolean {
        return isHealthyForLegacyCap(doc, this.operationalFloor, this.MAX_FAILED_ATTEMPTS);
    }

    // ---- Promote-specific: updateNameAndBio (uses firstName + petName) ----

    protected otherPoolModel() {
        return this.bufferClientService.model;
    }

    // ---- Promote-specific: updateUsername (clears username) ----

    async updateUsername(doc: PromoteClientDocument, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'light');

            await this.telegramService.updateUsername(doc.mobile, '');
            await this.update(doc.mobile, {
                usernameUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Cleared username for ${doc.mobile}`);
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

    // ---- CRUD (promote-specific) ----

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

    async create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient> {
        const canonicalMobile = this.canonicalMobile(promoteClient.mobile);
        const status = promoteClient.status || 'active';
        const session = this.normalizeSessionForWrite(promoteClient.session);
        if (status === 'active' && !session) {
            throw new BadRequestException('Active PromoteClient requires a session');
        }
        // Cross-collection dedup guard: prevent the same mobile from being created in
        // promoteClients when it already lives in another pool (buffer/clients) — the same
        // account running concurrently across pools causes Telegram SESSION_REVOKED.
        // The check-then-create is serialized per canonical mobile (across buffer + promote
        // services in this process) so two concurrent enrollments can't both pass the check.
        const result = await withEnrollmentLock(canonicalMobile, () => this.withPoolClaimOrRefuse(canonicalMobile, async () => {
            const enrolledIn = await this.isMobileEnrolledAnywhere(canonicalMobile);
            if (enrolledIn && enrolledIn !== 'promoteClients') {
                throw new BadRequestException(
                    `Mobile ${canonicalMobile} is already enrolled in ${enrolledIn}; refusing to create a cross-pool PromoteClient`
                );
            }
            const promoteClientData = {
                ...promoteClient,
                mobile: canonicalMobile,
                ...(session ? { session } : {}),
                status,
                message: promoteClient.message || 'Account is functioning properly',
                warmupPhase: WarmupPhase.ENROLLED,
                warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                enrolledAt: new Date(),
                sessionRotatedAt: null,
            };
            const newUser = new this.promoteClientModel(promoteClientData);
            return newUser.save();
        }));
        await this.sendAccountNotice(
            {
                severity: 'success',
                title: 'Promote created',
                fields: [
                    { label: 'Mobile', value: canonicalMobile },
                    { label: 'Client ID', value: promoteClient.clientId || '-' },
                    { label: 'Status', value: result.status, code: false },
                    { label: 'Available date', value: promoteClient.availableDate || '-', code: false },
                    { label: 'Channels', value: promoteClient.channels ?? '-', code: false },
                    { label: 'Note', value: promoteClient.message || '-', code: false },
                ],
            }
        );
        return result;
    }

    async findAll(statusFilter?: ClientStatusType): Promise<PromoteClient[]> {
        const filter = statusFilter ? { status: statusFilter } : {};
        return this.promoteClientModel.find(filter).exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<PromoteClientDocument | null> {
        const canonicalMobile = this.canonicalMobile(mobile);
        const user = (await this.promoteClientModel.findOne({ mobile: canonicalMobile }).exec())?.toJSON() || null;
        if (!user && throwErr) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user as PromoteClientDocument | null;
    }

    async existsByMobile(mobile: string): Promise<boolean> {
        const canonicalMobile = this.canonicalMobile(mobile);
        return !!(await this.promoteClientModel.findOne({ mobile: canonicalMobile }, { _id: 1 }).lean().exec());
    }

    async update(mobile: string, updateClientDto: BaseClientUpdate): Promise<PromoteClientDocument> {
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
            throw new BadRequestException('Cannot activate PromoteClient without a session');
        }
        const updatedUser = await this.promoteClientModel
            .findOneAndUpdate({ mobile: canonicalMobile }, { $set: updateData }, { returnDocument: 'after' })
            .exec();
        if (!updatedUser) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return updatedUser;
    }

    /**
     * Two-tier join candidate selection (ported from BufferClientService 2026-08-27).
     *
     * A single `.find(query).sort({ channels: -1 }).limit(maxMapSize)` strands terminal accounts
     * that sit BELOW the runtime floor: they compete for the same `maxMapSize` slots as every
     * warmup-phase account, and the descending channel sort buries the low-channel ones. Measured
     * on prod 2026-08-27: 49 promote accounts were stuck in READY/SESSION_ROTATED below the 230
     * floor (channels 3..229, several only 1-16 short) while bufferClients — which already had
     * this recovery tier — had ZERO stranded accounts.
     *
     * Recovery accounts are already terminal but cannot be selected by the runtime until they
     * reach the promote floor. Put them ahead of new warmup accounts without changing which
     * accounts are eligible or increasing any Telegram activity limits.
     */
    private async findPrioritizedJoinCandidates(query: PromoteClientQuery): Promise<PromoteClientDocument[]> {
        const limit = this.config.maxMapSize;
        const operationalFloor = this.config.operationalChannelThreshold ?? 230;
        const recoveryQuery: PromoteClientQuery = {
            ...query,
            warmupPhase: { $in: [WarmupPhase.READY, WarmupPhase.SESSION_ROTATED] },
            channels: { $lt: operationalFloor },
        };

        const recoveryQueryResult = this.promoteClientModel
            .find(recoveryQuery)
            .sort({ channels: -1 })
            .limit(limit);
        const recoveryCandidates = await this.resolveJoinCandidateQuery(recoveryQueryResult);
        if (recoveryCandidates.length >= limit) return recoveryCandidates;

        const recoveryMobiles = new Set(recoveryCandidates.map((candidate) => candidate.mobile));
        const standardQueryResult = this.promoteClientModel
            .find(query)
            .sort({ channels: -1 })
            .limit(limit);
        const standardCandidates = await this.resolveJoinCandidateQuery(standardQueryResult);

        return [
            ...recoveryCandidates,
            ...standardCandidates.filter((candidate) => !recoveryMobiles.has(candidate.mobile)),
        ].slice(0, limit);
    }

    private async resolveJoinCandidateQuery(query: unknown): Promise<PromoteClientDocument[]> {
        const executable = query as { exec?: () => Promise<PromoteClientDocument[]> };
        return typeof executable.exec === 'function'
            ? executable.exec()
            : Promise.resolve(query as PromoteClientDocument[]);
    }

    async refillJoinQueue(clientId?: string | null): Promise<number> {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) return 0;
        if (this.telegramService.hasActiveClientSetup()) return 0;

        this.resetDailyJoinCountersIfNeeded();

        const query: PromoteClientQuery = {
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(this.joinChannelMap.keys()) },
            ...this.getJoinCapacityEligibilityFilter(),
        };
        if (clientId) query.clientId = clientId;

        // Recovery-first, then descending channels: stranded terminal accounts (below the runtime
        // floor) are rescued ahead of new warmup accounts; within each tier, accounts closest to
        // target go first so near-complete accounts finish sooner.
        const eligible = await this.findPrioritizedJoinCandidates(query);

        let added = 0;
        let leaveAdded = 0;
        for (const doc of eligible) {
            if (this.isMobileDailyCapped(doc.mobile)) continue;
            // Hoisted so the catch can hand the live client to buildPermanentAccountReason —
            // freeze metadata (freeze_until_date / appeal_url) can only be read from Telegram
            // while the connection is still open. See the note on the catch below.
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
                    // Pass the client: without it buildPermanentAccountReason short-circuits and the
                    // freeze window is lost forever. Measured 2026-09-05: 0 of 433 frozen accounts
                    // had freeze_until captured, because this join/refill path — where
                    // channels.JoinChannel freezes actually happen — omitted the client argument.
                    const reason = await this.buildPermanentAccountReason(errorDetails.message, client);
                    await this.deactivateClient(doc.mobile, reason, { permanent: true });
                }
            } finally {
                await this.safeUnregisterClient(doc.mobile);
            }
        }

        if (added > 0) {
            this.logger.log(`Refilled join queue with ${added} promote clients`);
        }
        if (leaveAdded > 0 && !this.leaveChannelIntervalId) {
            this.createTimeout(() => this.leaveChannelQueue(), 5000 + Math.random() * 3000);
        }

        return added;
    }


    async updateLastUsed(mobile: string): Promise<PromoteClient> {
        return this.update(mobile, { lastUsed: new Date() });
    }

    async createOrUpdate(mobile: string, createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto): Promise<PromoteClient> {
        const canonicalMobile = this.canonicalMobile(mobile);
        if (await this.existsByMobile(canonicalMobile)) {
            const updateDto: UpdatePromoteClientDto = {
                ...createOrUpdateUserDto,
                mobile: canonicalMobile,
            };
            return this.update(canonicalMobile, updateDto);
        } else {
            return this.create({ ...createOrUpdateUserDto, mobile: canonicalMobile } as CreatePromoteClientDto);
        }
    }

    async remove(mobile: string, message?: string): Promise<void> {
        // Same as buffer remove(): a malformed mobile is a 400, and the notice names the stored mobile.
        const canonicalMobile = this.canonicalMobile(mobile);
        try {
            const deleteResult = await this.promoteClientModel.deleteOne({ mobile: canonicalMobile }).exec();
            if (deleteResult.deletedCount === 0) {
                throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }
            await sendBotNotice('notif', {
                severity: 'warning',
                title: 'Deleting promote',
                fields: [
                    { label: 'Service', value: process.env.serviceName || process.env.clientId || 'unknown' },
                    { label: 'Mobile', value: canonicalMobile },
                    { label: 'Reason', value: message || 'manual removal', code: false },
                ],
            });
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            const errorDetails = parseError(error);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
    }

    async search(filter: Partial<PromoteClient>): Promise<PromoteClient[]> {
        const query: PromoteClientQuery = { ...filter };
        if (typeof query.mobile === 'string' && query.mobile) {
            query.mobile = this.canonicalMobile(query.mobile);
        }
        const regexFields = ['clientId'];
        for (const field of regexFields) {
            if (typeof query[field] === 'string' && query[field]) {
                query[field] = { $regex: new RegExp(query[field].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
            }
        }
        return this.promoteClientModel.find(query).exec();
    }

    async executeQuery(query: object, sort?: Record<string, 1 | -1>, limit?: number, skip?: number): Promise<PromoteClientDocument[]> {
        if (!query) throw new BadRequestException('Query is invalid.');
        try {
            const queryExec = this.promoteClientModel.find(query);
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

    // ---- Promote-specific: Enrollment (redesigned — no 2FA, no removeExternalLoginSessions, no profile changes) ----

    /** Cross-process one-pool-per-mobile claim (shared/onboarding/pool-claim.ts); refuses while the other pool holds it. */
    private async withPoolClaimOrRefuse<T>(canonicalMobile: string, fn: () => Promise<T>): Promise<T> {
        const claim = await withPoolClaim(this.model, canonicalMobile, 'promoteClients', fn);
        if ('heldBy' in claim) {
            throw new BadRequestException(`Mobile ${canonicalMobile} is being enrolled in ${claim.heldBy} right now; refusing to create a cross-pool PromoteClient`);
        }
        return claim.value;
    }

    async setAsPromoteClient(
        mobile: string,
        clientId?: string,
        availableDate: string = ClientHelperUtils.getTodayDateString(),
    ) {
        return setAsPoolClient(this.setAsPort(), mobile, clientId, availableDate);
    }

    private setAsPort(): SetAsPort {
        return {
            profile: PROMOTE_PROFILE,
            model: this.model as unknown as Model<any>,
            usersService: this.usersService,
            clientService: this.clientService,
            telegramService: this.telegramService,
            canonicalMobile: (m) => this.canonicalMobile(m),
            mobilesMatch: (a, b) => this.mobilesMatch(a, b),
            findOne: (m, t) => this.findOne(m, t),
            otherPoolExistsByMobile: (m) => this.bufferClientService.existsByMobile(m),
            isMobileEnrolledAnywhere: (m) => this.isMobileEnrolledAnywhere(m),
            withPoolClaimOrRefuse: (m, fn) => this.withPoolClaimOrRefuse(m, fn),
            safeUnregisterClient: (m) => this.safeUnregisterClient(m),
        };
    }

    // ---- Promote-specific: updateInfo ----

    async updateInfo() {
        await this.runPeriodicHealthChecks();
    }

    // ---- Promote-specific: Channel joining entry point ----

    async joinchannelForPromoteClients(skipExisting: boolean = true): Promise<string> {
        if (this.telegramService.hasActiveClientSetup()) {
            return 'Active client setup exists, skipping promotion';
        }
        // Don't destroy in-flight joins — skip if still processing
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) {
            this.logger.warn('Join/leave processing still in progress, skipping re-entry');
            return 'Join/leave still processing, skipped';
        }
        // Dedicated prepare-join reentrancy guard (replaces the old global lock).
        if (this.isPrepareJoinChannelsProcessing) {
            return 'Join-channel prepare already running, skipped';
        }
        this.isPrepareJoinChannelsProcessing = true;

        try {
            this.logger.log('Starting join channel process');

            const preservedMobiles = await this.prepareJoinChannelRefresh(skipExisting);

            try {
            // Recovery-first (see findPrioritizedJoinCandidates): terminal accounts below the
            // runtime floor must not lose their join slots to warmup accounts with more channels.
            const clients = await this.findPrioritizedJoinCandidates({
                channels: { $lt: this.config.channelTarget },
                mobile: { $nin: Array.from(preservedMobiles) },
                status: 'active',
                ...this.getJoinCapacityEligibilityFilter(),
            });

            const joinSet = new Set<string>();
            const leaveSet = new Set<string>();
            let successCount = 0;
            let failCount = 0;

            for (const document of clients) {
                const mobile = document.mobile;
                // Same guard as refillJoinQueue: a capped mobile can't join today, so don't connect it.
                if (this.isMobileDailyCapped(mobile)) continue;
                // Hoisted so the catch can pass it to buildPermanentAccountReason (freeze metadata
                // is only readable while the connection is open).
                let client: TelegramManager | null = null;
                try {
                    client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });

                    await sleep(5000 + Math.random() * 3000);
                    const channels = await channelInfo(client.client, true);
                    await sleep(5000 + Math.random() * 3000);
                    await this.update(mobile, { channels: channels.ids.length });
                    if (this.isTerminalOperationalAfterRefresh(document, channels.ids.length)) {
                        successCount++;
                        continue;
                    }

                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = this.getJoinedChannelIdsFromInfo(channels);
                        await sleep(5000 + Math.random() * 3000);
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
                    const errorDetails = parseError(error);
                    if (isPermanentError(errorDetails)) {
                        await sleep(1000);
                        // Pass the live client so freeze metadata is captured — see refillJoinQueue.
                        const reason = await this.buildPermanentAccountReason(errorDetails.message, client);
                        await this.deactivateClient(mobile, reason, { permanent: true });
                    }
                } finally {
                    await this.safeUnregisterClient(mobile);
                    await sleep(this.config.clientProcessingDelay + Math.random() * 5000);
                }
            }

            await sleep(6000 + Math.random() * 3000);

            if (joinSet.size > 0) {
                this.createTimeout(() => this.joinChannelQueue(), 2000);
            }
            if (leaveSet.size > 0) {
                this.createTimeout(() => this.leaveChannelQueue(), 5000);
            }

            return `Initiated Joining channels for ${joinSet.size} | Queued for leave: ${leaveSet.size}`;
            } catch (error) {
                // Same as the buffer sweep: report and rethrow, but keep every other account's
                // queued joins/leaves (one unexpected error used to wipe the whole promote queue).
                this.logger.error('Unexpected error during joinchannelForPromoteClients:', error);
                throw new Error('Failed to initiate channel joining process');
            }
        } finally {
            this.isPrepareJoinChannelsProcessing = false;
        }
    }

    // ---- Promote-specific: Check & process promote clients ----

    async checkPromoteClients() {
        // Self-reentrancy only (no global lock — warmup may run alongside join/leave).
        if (this.isWarmupCheckProcessing) {
            this.logger.warn('Skipping checkPromoteClients: a warmup check is already running');
            return;
        }
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ignored active check promote channels as active client setup exists');
            return;
        }
        this.isWarmupCheckProcessing = true;
        try {
            // One run = one summary message: per-mobile warmup/enrol events are collected and sent
            // inside the summary; anything left over (a crashed run) goes out here.
            await runWithNoticeBatch(async (batch) => {
                try {
                    await this._checkPromoteClientsInternal();
                } finally {
                    await this.flushLeftoverNoticeBatch(batch, 'Promote warmup run (summary not reached)');
                }
            });
        } catch (error) {
            const errMsg = parseError(error, 'checkPromoteClients').message;
            this.logger.error(`checkPromoteClients crashed: ${errMsg}`);
            try { await sendBotNotice('notif', { severity: 'error', title: 'Check crashed', fields: [{ label: 'Pool', value: 'promote', code: false }], summary: errMsg.slice(0, 200), details: errMsg.length > 200 ? errMsg : undefined, detailsTitle: 'Error message' }); } catch { /* best effort */ }
        } finally {
            this.isWarmupCheckProcessing = false;
        }
    }

    /**
     * Rotates only READY accounts after the normal promote warmup pass. Checks
     * and setup remain serialized; joins/leaves may proceed for other mobiles.
     */
    async rotateReadyPromoteClients(): Promise<boolean> {
        if (this.readyRotationInProgress) {
            this.logger.warn('Ready promote rotation skipped: another ready rotation is already running');
            return false;
        }
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ready promote rotation skipped: active client setup exists');
            return false;
        }
        // Skip rotation while a warmup check is editing account state (same-session concern).
        // Join/leave may overlap rotation (terminal phases are excluded from join queries).
        if (this.isWarmupCheckProcessing) {
            this.logger.warn('Ready promote rotation skipped: warmup check is active');
            return false;
        }

        this.readyRotationInProgress = true;
        try {
            const clients = await this.clientService.findAll();
            const clientMap = new Map(clients.map((client) => [client.clientId, client]));
            const readyClients = await this.promoteClientModel
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
                (promoteClient) => this.joinChannelMap.has(promoteClient.mobile)
                    || this.leaveChannelMap.has(promoteClient.mobile),
            );

            this.logger.log(
                `Ready promote rotation sweep complete: candidates=${readyClients.length}, attempted=${attempted}, rotated=${rotated}, deferred=${deferred}, skipped=${skipped}`,
            );
            return attempted > 0;
        } catch (error) {
            const errMsg = parseError(error, 'rotateReadyPromoteClients').message;
            this.logger.error(`Ready promote rotation sweep crashed: ${errMsg}`);
            try { await sendBotNotice('notif', { severity: 'error', title: 'Rotation crashed', fields: [{ label: 'Pool', value: 'promote', code: false }], summary: errMsg.slice(0, 200), details: errMsg.length > 200 ? errMsg : undefined, detailsTitle: 'Error message' }); } catch { /* best effort */ }
            return false;
        } finally {
            this.readyRotationInProgress = false;
        }
    }

    private async _checkPromoteClientsInternal() {

        const clients = await this.clientService.findAll();
        const bufferClients = await this.bufferClientService.findAll();
        const clientMap = new Map(clients.map((client) => [client.clientId, client]));
        const now = Date.now();

        const clientMainMobiles = clients.map((c) => c.mobile);
        const bufferClientIds = bufferClients.map((c) => c.mobile);
        const assignedPromoteClients = await this.promoteClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();
        // Exclude ALL promote client mobiles (not just active) from candidate pool to prevent re-enrollment
        const allPromoteClientMobiles = (await this.promoteClientModel.find({}, { mobile: 1 }).lean().exec()).map((doc) => doc.mobile);

        const goodIds = buildEnrolmentExclusions(clientMainMobiles, bufferClientIds, allPromoteClientMobiles);

        let totalUpdates = 0;
        const updatedEntries: CheckEntry[] = [];
        // warmupAction computed ONCE here and carried through (priority + sensitive/organic
        // prechecks reuse it), instead of recomputing per account (was 3× + TOCTOU risk).
        const promoteClientsToProcess: Array<{
            promoteClient: PromoteClientDocument;
            client: Client;
            clientId: string;
            priority: number;
            warmupAction: ReturnType<typeof getWarmupPhaseAction>;
        }> = [];

        for (const promoteClient of assignedPromoteClients) {
            if (!promoteClient.clientId) continue;
            const client = clientMap.get(promoteClient.clientId);
            if (!client) continue;
            if (promoteClient.inUse === true) continue;

            const lastUpdateAttempt = promoteClient.lastUpdateAttempt ? new Date(promoteClient.lastUpdateAttempt).getTime() : 0;
            if (this.isOnCooldown(promoteClient.mobile, promoteClient.lastUpdateAttempt, now)) continue;

            const warmupPhase = promoteClient.warmupPhase;
            if (!warmupPhase) {
                this.logger.warn(`Skipping promote client ${promoteClient.mobile}: incomplete lifecycle metadata`);
                continue;
            }
            // Terminal phases are owned by selection/rotation paths. Normal
            // maintenance must never re-enter them or perform extra Telegram
            // health/session work on already-consumable accounts.
            if (warmupPhase === WarmupPhase.READY || warmupPhase === WarmupPhase.SESSION_ROTATED) continue;
            const warmupAction = getWarmupPhaseAction(promoteClient, now, { operationalFloor: this.operationalFloor });
            const priority = calculateWarmupPriority(promoteClient, warmupAction, now);

            promoteClientsToProcess.push({ promoteClient: promoteClient as PromoteClientDocument, client, clientId: promoteClient.clientId, priority, warmupAction });
        }

        promoteClientsToProcess.sort((a, b) => b.priority - a.priority);

        // Self-healing cap: size this run's mutation budget to the live pending backlog (see
        // getEffectiveUpdatesCap). Promote's backlog is larger, so this lifts the cap toward the
        // ceiling automatically while it catches up, then relaxes as the pool drains.
        const effectiveCap = this.getEffectiveUpdatesCap(promoteClientsToProcess.length);
        let sensitiveUpdates = 0; // separate, tighter budget for high-risk actions (anti-detection)
        let organicUpdates = 0;   // separate budget so organic no-ops can't monopolize the run
        this.logger.log(`Promote warmup run: ${promoteClientsToProcess.length} eligible, effective cap=${effectiveCap} (ceiling ${this.MAX_UPDATES_PER_CYCLE}), sensitive sub-cap=${this.MAX_SENSITIVE_ACTIONS_PER_CYCLE}, organic sub-cap=${this.MAX_ORGANIC_ACTIONS_PER_CYCLE}`);

        for (const { promoteClient, client, warmupAction } of promoteClientsToProcess) {
            if (totalUpdates >= effectiveCap) break;
            const warmupPhase = promoteClient.warmupPhase || WarmupPhase.ENROLLED;
            if (warmupPhase === WarmupPhase.SESSION_ROTATED) {
                const lastChecked = promoteClient.lastChecked ? new Date(promoteClient.lastChecked).getTime() : 0;
                const healthCheck = await this.performHealthCheck(promoteClient.mobile, lastChecked, now);
                if (!healthCheck.passed) continue;
            }
            const plannedAction = warmupAction.action; // computed once above; reused here

            // Organic sub-cap: organic_only makes no phase progress but costs a ~20s TG session.
            // Cap it so gated accounts can't monopolize the run and starve real mutations (see
            // buffer equivalent). Skipped organic accounts keep lastUpdateAttempt untouched.
            if (plannedAction === 'organic_only' && organicUpdates >= this.MAX_ORGANIC_ACTIONS_PER_CYCLE) {
                continue;
            }

            // Anti-detection sub-cap: keep high-risk actions sparse per run (see buffer equivalent).
            const plannedSensitive = this.isSensitiveWarmupAction(plannedAction);
            if (plannedSensitive && sensitiveUpdates >= this.MAX_SENSITIVE_ACTIONS_PER_CYCLE) {
                continue;
            }

            // Count the PLANNED action against its sub-cap on commit — a failed sensitive action
            // still consumed a risky attempt on this IP, so it must count (see buffer equivalent).
            if (plannedSensitive) sensitiveUpdates++;
            if (plannedAction === 'organic_only') organicUpdates++;

            const processResult = await this.processClient(promoteClient, client, warmupAction);
            if (processResult.updateCount > 0) {
                totalUpdates += processResult.updateCount;
                updatedEntries.push({ clientId: client.clientId, mobile: promoteClient.mobile, change: processResult.updateSummary || 'updated', count: processResult.updateCount });
            }
        }

        // Enrolment plan: legacy window need capped per client (30), then bounded by the promote
        // warmup engine's capacity like buffer's (pool-onboarding M12).
        const plan = await this.buildPromoteEnrolmentPlan(clients.map((c) => c.clientId), assignedPromoteClients, now);

        let dynamicCreateResult: { createdCount: number; attemptedCount: number; createdEntries: CheckEntry[] } = {
            createdCount: 0,
            attemptedCount: 0,
            createdEntries: [],
        };
        if (plan.needs.length > 0) {
            try {
                dynamicCreateResult = await this.addNewUserstoPromoteClientsDynamic([], goodIds, plan.needs, plan.healthyPerClient);
            } catch (error) {
                const errMsg = parseError(error, 'addNewUserstoPromoteClientsDynamic').message;
                this.logger.error(`Dynamic promote enrollment failed: ${errMsg}`);
                try { await sendBotNotice('notif', { severity: 'warning', title: 'Enroll failed', fields: [{ label: 'Pool', value: 'promote', code: false }], summary: errMsg.slice(0, 200), details: errMsg.length > 200 ? errMsg : undefined, detailsTitle: 'Error message' }); } catch { /* best effort */ }
            }
        }

        await this.sendPromoteCheckSummaryNotification(
            totalUpdates,
            dynamicCreateResult.createdCount,
            dynamicCreateResult.attemptedCount,
            updatedEntries,
            dynamicCreateResult.createdEntries,
        );
    }

    // ---- Promote-specific: Create promote client from user (redesigned) ----

    /**
     * Check if a mobile is already enrolled in any collection (promote, buffer, or active client).
     * Returns the collection name if found, null otherwise.
     */
    private async isMobileEnrolledAnywhere(mobile: string): Promise<string | null> {
        const [promoteExists, bufferExists, clientExists] = await Promise.all([
            this.existsByMobile(mobile),
            this.bufferClientService.existsByMobile(mobile),
            this.clientService.findAll().then((clients) => clients.some((c) => this.mobilesMatch(c.mobile, mobile))),
        ]);
        if (promoteExists) return 'promoteClients';
        if (bufferExists) return 'bufferClients';
        if (clientExists) return 'clients';
        return null;
    }

    private async createPromoteClientFromUser(
        document: { mobile: string; tgId: string },
        targetClientId: string,
        availableDate?: string
    ): Promise<boolean> {
        return enrolPoolClientFromUser(this.enrolmentPort(), document, targetClientId, availableDate);
    }

    /** Bound view of this service for the shared enrolment pipeline (shared/onboarding/enrolment.ts). */
    private enrolmentPort(): EnrolmentPort {
        return {
            profile: PROMOTE_PROFILE,
            model: this.model,
            logger: this.logger,
            usersService: this.usersService,
            canonicalMobile: (mobile) => this.canonicalMobile(mobile),
            isMobileEnrolledAnywhere: (mobile) => this.isMobileEnrolledAnywhere(mobile),
            updateUser2FAStatus: (tgId, mobile) => this.updateUser2FAStatus(tgId, mobile),
            sendAccountNotice: (input) => this.sendAccountNotice(input),
            handleError: (error, context, mobile) => this.handleError(error, context, mobile),
            safeUnregisterClient: (mobile) => this.safeUnregisterClient(mobile),
            docExtras: () => ({ lastActive: new Date().toISOString() }),
        };
    }

    // ---- Promote-specific: Pool management ----

    async addNewUserstoPromoteClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingPromoteClients: string[] = [],
        _promoteClientsPerClient?: Map<string, number>,
    ) {
        // Manual bulk enrol obeys the same per-client cap (counted from the live pool, not from 0)
        // and the same engine budget as the scheduled run (tracker D10/M12).
        const plan = await this.buildPromoteEnrolmentPlan(clientsNeedingPromoteClients);
        if (plan.needs.length === 0) return;
        await this.addNewUserstoPromoteClientsDynamic(badIds, goodIds, plan.needs, plan.healthyPerClient);
    }

    /**
     * Per-client promote need (legacy windows, capped at the healthy cap) shared out in priority
     * order within the warmup-engine budget: the per-run maximum, the rolling-7-day engine ceiling
     * and the pipeline the engine can carry (same formula as buffer, computeFleetEnrollmentBudget).
     */
    async buildPromoteEnrolmentPlan(
        clientIds: string[],
        assigned?: Array<Partial<PromoteClientDocument>>,
        now: number = Date.now(),
    ): Promise<{ needs: ClientEnrolmentNeed[]; healthyPerClient: Map<string, number>; budget: FleetBudget; enrolledLast7d: number; fleetWarming: number }> {
        const docs = assigned ?? await this.promoteClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' }, { clientId: 1, warmupPhase: 1, channels: 1, failedUpdateAttempts: 1 })
            .lean().exec() as Array<Partial<PromoteClientDocument>>;
        const healthyPerClient = new Map<string, number>();
        let fleetWarming = 0;
        for (const doc of docs) {
            if (!doc.clientId) continue;
            if (!this.isHealthyPromoteClientForCap(doc, now)) continue;
            healthyPerClient.set(doc.clientId, (healthyPerClient.get(doc.clientId) || 0) + 1);
            if (doc.warmupPhase !== WarmupPhase.READY && doc.warmupPhase !== WarmupPhase.SESSION_ROTATED) fleetWarming += 1;
        }
        const enrolledLast7d = await this.promoteClientModel.countDocuments({ enrolledAt: { $gte: new Date(now - 7 * this.ONE_DAY_MS) } });
        const budget = computeFleetEnrollmentBudget({
            maxNewPerRun: this.config.maxNewClientsPerTrigger,
            weeklyCeiling: engineWeeklyCeiling(this.MAX_SENSITIVE_ACTIONS_PER_CYCLE, this.WARMUP_RUNS_PER_DAY),
            enrolledLast7d,
            fleetWarming,
            leadTimeDays: PROMOTE_ENROLMENT_LEAD_TIME_DAYS,
        });

        const capped: ClientEnrolmentNeed[] = [];
        for (const clientId of clientIds) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeedsForCurrentState(clientId);
            if (availabilityNeeds.totalNeeded <= 0) continue;
            const healthyCount = healthyPerClient.get(clientId) || 0;
            const remainingCapacity = Math.max(0, this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT - healthyCount);
            if (remainingCapacity <= 0) {
                this.logger.debug(`Skipping dynamic promote enrollment for ${clientId}: healthy pool already at cap`, {
                    healthyCount,
                    cap: this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT,
                    requested: availabilityNeeds.totalNeeded,
                });
                continue;
            }
            const cappedNeeded = Math.min(availabilityNeeds.totalNeeded, remainingCapacity);
            capped.push({
                clientId,
                ...availabilityNeeds,
                totalNeeded: cappedNeeded,
                calculationReason: cappedNeeded < availabilityNeeds.totalNeeded
                    ? `${availabilityNeeds.calculationReason}; capped to remaining healthy capacity ${remainingCapacity}/${this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT}`
                    : availabilityNeeds.calculationReason,
            });
        }
        capped.sort((a, b) => a.priority - b.priority);

        // Priority order, first come first served, up to the budget (was: up to maxNewClientsPerTrigger).
        const needs: ClientEnrolmentNeed[] = [];
        let left = budget.budget;
        for (const need of capped) {
            if (left <= 0) break;
            const allocated = Math.min(need.totalNeeded, left);
            left -= allocated;
            needs.push({ ...need, totalNeeded: allocated });
        }
        this.logger.info('Promote enrolment plan (fleet)', {
            ...budget,
            enrolledLast7d,
            fleetWarming,
            totalNeed: capped.reduce((sum, n) => sum + n.totalNeeded, 0),
            totalAllocated: needs.reduce((sum, n) => sum + n.totalNeeded, 0),
        });
        return { needs, healthyPerClient, budget, enrolledLast7d, fleetWarming };
    }

    async addNewUserstoPromoteClientsDynamic(
        badIds: string[],
        goodIds: string[],
        clientsNeedingPromoteClients: Array<{
            clientId: string;
            totalNeeded: number;
            windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
            totalActive: number;
            totalNeededForCount: number;
            calculationReason: string;
            priority: number;
        }>,
        promoteClientsPerClient?: Map<string, number>,
    ): Promise<{ createdCount: number; attemptedCount: number; createdEntries: CheckEntry[] }> {
        return runEnrolmentBatch({
            label: 'promote',
            logger: this.logger,
            usersService: this.usersService,
            goodIds,
            needs: clientsNeedingPromoteClients,
            countedPerClient: promoteClientsPerClient,
            capFor: (clientId) => this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT,
            maxNewPerRun: this.config.maxNewClientsPerTrigger,
            inactiveSince: ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS),
            enrolOne: (document, clientId, availableDate) => this.createPromoteClientFromUser(document, clientId, availableDate),
        });
    }

    // ---- Promote-specific: Distribution stats ----

    async getPromoteClientDistribution(): Promise<{
        totalPromoteClients: number;
        unassignedPromoteClients: number;
        activePromoteClients: number;
        inactivePromoteClients: number;
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
            clientsWithSufficientPromoteClients: number;
            clientsNeedingPromoteClients: number;
            totalPromoteClientsNeeded: number;
            maxPromoteClientsPerTrigger: number;
            triggersNeededToSatisfyAll: number;
        };
    }> {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);

        const [
            totalPromoteClients, unassignedPromoteClients, activePromoteClients, inactivePromoteClients,
            assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts,
        ] = await Promise.all([
            this.promoteClientModel.countDocuments({}),
            this.promoteClientModel.countDocuments({ clientId: { $exists: false } }),
            this.promoteClientModel.countDocuments({ status: 'active' }),
            this.promoteClientModel.countDocuments({ status: 'inactive' }),
            this.promoteClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null } } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.promoteClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'active' } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.promoteClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.promoteClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'active', $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }] } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
            this.promoteClientModel.aggregate([{ $match: { clientId: { $exists: true, $ne: null }, status: 'active', lastUsed: { $gte: last24Hours } } }, { $group: { _id: '$clientId', count: { $sum: 1 } } }]),
        ]);

        const toMap = (arr: ClientCount[]) => new Map(arr.map((item) => [item._id, item.count]));
        const assignedCountMap = toMap(assignedCounts);
        const activeCountMap = toMap(activeCounts);
        const inactiveCountMap = toMap(inactiveCounts);
        const neverUsedCountMap = toMap(neverUsedCounts);
        const recentlyUsedCountMap = toMap(recentlyUsedCounts);

        const distributionPerClient: Array<{
            clientId: string; assignedCount: number; activeCount: number; inactiveCount: number;
            needed: number; status: 'sufficient' | 'needs_more'; neverUsed: number; usedInLast24Hours: number;
        }> = [];
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
                status: needed === 0 ? 'sufficient' : 'needs_more',
                neverUsed: neverUsedCountMap.get(client.clientId) || 0,
                usedInLast24Hours: recentlyUsedCountMap.get(client.clientId) || 0,
            });
            if (needed === 0) clientsWithSufficient++; else { clientsNeedingMore++; totalNeeded += needed; }
        }

        return {
            totalPromoteClients, unassignedPromoteClients, activePromoteClients, inactivePromoteClients,
            distributionPerClient,
            summary: {
                clientsWithSufficientPromoteClients: clientsWithSufficient,
                clientsNeedingPromoteClients: clientsNeedingMore,
                totalPromoteClientsNeeded: totalNeeded,
                maxPromoteClientsPerTrigger: this.config.maxNewClientsPerTrigger,
                triggersNeededToSatisfyAll: Math.ceil(totalNeeded / this.config.maxNewClientsPerTrigger),
            },
        };
    }

    async getPromoteClientsByStatus(status: ClientStatusType): Promise<PromoteClient[]> {
        return this.promoteClientModel.find({ status }).exec();
    }

    async getPromoteClientsWithMessages() {
        return this.promoteClientModel.find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 }).exec();
    }

    async getLeastRecentlyUsedPromoteClients(clientId: string, limit: number = 1): Promise<PromoteClient[]> {
        return await this.getLeastRecentlyUsedClients(clientId, limit) as PromoteClient[];
    }

    async getNextAvailablePromoteClient(clientId: string): Promise<PromoteClient | null> {
        const clients = await this.getLeastRecentlyUsedPromoteClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }

    async getUnusedPromoteClients(hoursAgo: number = 24, clientId?: string): Promise<PromoteClientDocument[]> {
        return await this.getUnusedClients(hoursAgo, clientId) as PromoteClientDocument[];
    }

    private async sendPromoteCheckSummaryNotification(
        totalUpdates: number,
        createdCount: number,
        attemptedCount: number,
        updatedEntries: CheckEntry[],
        createdEntries: CheckEntry[],
    ): Promise<void> {
        const distribution = await this.getPromoteClientDistribution();
        const summary = buildCheckSummaryNotification({
                kind: 'Promote',
                active: distribution.activePromoteClients,
                inactive: distribution.inactivePromoteClients,
                unassigned: distribution.unassignedPromoteClients,
                totalUpdates,
                createdCount,
                attemptedCount,
                totalNeeded: distribution.summary.totalPromoteClientsNeeded,
                clientsNeedingMore: distribution.summary.clientsNeedingPromoteClients,
                perClient: distribution.distributionPerClient,
                updatedEntries,
                createdEntries,
            });
        const eventsTable = eventsToTable(currentNoticeBatch()?.drain() ?? [], 'Events');
        if (eventsTable) (summary.tables ??= []).push(eventsTable);
        await sendNoticeBatched(
            (input) => this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, input, undefined, false),
            summary,
        );
    }

    // Backwards compat aliases
    removeFromPromoteMap(key: string) { this.removeFromJoinMap(key); }
    clearPromoteMap() { this.clearJoinMap(); }
}
