"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var BufferClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferClientService = void 0;
const channels_service_1 = require("./../channels/channels.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const telegram_1 = require("telegram");
const users_service_1 = require("../users/users.service");
const active_channels_service_1 = require("../active-channels/active-channels.service");
const client_service_1 = require("../clients/client.service");
const promote_client_service_1 = require("../promote-clients/promote-client.service");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const session_manager_1 = require("../session-manager");
const channelinfo_1 = require("../../utils/telegram-utils/channelinfo");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
const persona_assignment_1 = require("../../utils/persona-assignment");
const homoglyph_normalizer_1 = require("../../utils/homoglyph-normalizer");
const bots_1 = require("../bots");
const base_client_service_1 = require("../shared/base-client.service");
const client_helper_utils_1 = require("../shared/client-helper.utils");
let BufferClientService = BufferClientService_1 = class BufferClientService extends base_client_service_1.BaseClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientServiceRef, sessionService, botsService) {
        super(telegramService, usersService, activeChannelsService, clientService, channelsService, sessionService, botsService, BufferClientService_1.name);
        this.bufferClientModel = bufferClientModel;
        this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT = 20;
        this.isCheckingBufferClients = false;
        this.promoteClientService = promoteClientServiceRef;
    }
    async getPrimaryClientMobiles(clientId) {
        const clients = await this.clientService.findAll();
        const primaryClientMobiles = new Set(clients
            .filter((client) => !!client.mobile && (!clientId || client.clientId === clientId))
            .map((client) => client.mobile));
        this.logger.debug('Resolved primary client mobiles for buffer guards', {
            clientId: clientId || 'all',
            count: primaryClientMobiles.size,
        });
        return primaryClientMobiles;
    }
    isPrimaryClientMobile(mobile, primaryClientMobiles) {
        return !!mobile && primaryClientMobiles.has(mobile);
    }
    isHealthyBufferClientForCap(doc, now) {
        const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc);
        if (phase === base_client_service_1.WarmupPhase.READY || phase === base_client_service_1.WarmupPhase.SESSION_ROTATED) {
            return true;
        }
        const failedAttempts = doc.failedUpdateAttempts || 0;
        if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
            return false;
        }
        const enrolledAtMs = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.enrolledAt) || client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.createdAt);
        if (enrolledAtMs > 0) {
            const daysSinceEnrolled = (now - enrolledAtMs) / this.ONE_DAY_MS;
            if (daysSinceEnrolled > 45) {
                return false;
            }
        }
        return true;
    }
    get model() {
        return this.bufferClientModel;
    }
    get clientType() {
        return 'buffer';
    }
    get config() {
        return {
            joinChannelInterval: 6 * 60 * 1000,
            leaveChannelInterval: 120 * 1000,
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,
            channelTarget: 200,
            maxJoinsPerSession: 8,
            maxNewClientsPerTrigger: 10,
            minTotalClients: 10,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: 10000,
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }
    async updateNameAndBio(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, base_client_service_1.performOrganicActivity)(telegramClient, 'medium');
            const me = await telegramClient.getMe();
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            let updateCount = 0;
            if ((client.firstNames?.length > 0) || (client.bufferLastNames?.length > 0) || (client.bios?.length > 0) || (client.profilePics?.length > 0)) {
                let assignment = null;
                const hasValidAssignment = (doc.assignedFirstName != null ||
                    doc.assignedLastName != null ||
                    doc.assignedBio != null);
                if (hasValidAssignment) {
                    assignment = {
                        assignedFirstName: doc.assignedFirstName,
                        assignedLastName: doc.assignedLastName,
                        assignedBio: doc.assignedBio,
                        assignedProfilePics: doc.assignedProfilePics,
                    };
                }
                else {
                    const pool = {
                        firstNames: client.firstNames,
                        lastNames: client.bufferLastNames || [],
                        bios: client.bios || [],
                        profilePics: client.profilePics || [],
                        dbcoll: client.dbcoll,
                    };
                    const existingAssignments = await this.model.find({
                        clientId: doc.clientId, status: 'active',
                        mobile: { $ne: doc.mobile },
                        $or: [
                            { assignedFirstName: { $ne: null } },
                            { assignedLastName: { $ne: null } },
                            { assignedBio: { $ne: null } },
                            { 'assignedProfilePics.0': { $exists: true } },
                        ],
                    }, { mobile: 1, assignedFirstName: 1, assignedLastName: 1, assignedBio: 1, assignedProfilePics: 1 }).lean();
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
                    }
                    catch { }
                    const activeClientAssignment = await this.clientService.getActiveClientAssignment(client);
                    if (activeClientAssignment && activeClientAssignment.mobile !== doc.mobile && !existingAssignments.some(a => a.mobile === activeClientAssignment.mobile)) {
                        existingAssignments.push(activeClientAssignment);
                    }
                    const usedKeys = new Set(existingAssignments.map(a => (0, persona_assignment_1.personaKey)({
                        firstName: a.assignedFirstName,
                        lastName: a.assignedLastName || '',
                        bio: a.assignedBio || '',
                        profilePics: a.assignedProfilePics || [],
                    })));
                    const candidates = (0, persona_assignment_1.generateCandidateCombinations)(pool, doc.mobile);
                    const chosen = candidates.find(c => !usedKeys.has((0, persona_assignment_1.personaKey)(c)));
                    if (!chosen) {
                        this.logger.warn(`No unique persona candidate available for ${doc.mobile}, falling back to first candidate`);
                    }
                    const pick = chosen || candidates[0];
                    if (pick) {
                        const result = await this.model.findOneAndUpdate({
                            mobile: doc.mobile,
                            $or: [
                                {
                                    assignedFirstName: null,
                                    assignedLastName: null,
                                    assignedBio: null,
                                    'assignedProfilePics.0': { $exists: false },
                                },
                            ],
                        }, { $set: {
                                assignedFirstName: pick.firstName,
                                assignedLastName: pick.lastName || null,
                                assignedBio: pick.bio || null,
                                assignedProfilePics: pick.profilePics,
                            } }, { new: true });
                        if (result) {
                            assignment = {
                                assignedFirstName: result.assignedFirstName,
                                assignedLastName: result.assignedLastName,
                                assignedBio: result.assignedBio,
                                assignedProfilePics: result.assignedProfilePics,
                            };
                            this.logger.log(`Assigned persona "${pick.firstName}" to ${doc.mobile}`);
                        }
                        else {
                            this.logger.warn(`Atomic persona assignment failed for ${doc.mobile} (guard condition not met)`);
                        }
                    }
                }
                const hasAnyAssignment = assignment != null && (assignment.assignedFirstName != null ||
                    assignment.assignedLastName != null ||
                    assignment.assignedBio != null);
                if (hasAnyAssignment) {
                    const fullUser = await telegramClient.client.invoke(new telegram_1.Api.users.GetFullUser({ id: new telegram_1.Api.InputUserSelf() }));
                    const currentLastName = this.readNestedString(fullUser, ['users', 0, 'lastName']);
                    const currentBio = this.readNestedString(fullUser, ['fullUser', 'about']);
                    const firstNameWrong = assignment?.assignedFirstName != null
                        && !(0, homoglyph_normalizer_1.nameMatchesAssignment)(me.firstName || '', assignment.assignedFirstName);
                    const lastNameWrong = assignment?.assignedLastName != null
                        && !(0, homoglyph_normalizer_1.lastNameMatches)(currentLastName, assignment.assignedLastName);
                    if (firstNameWrong || lastNameWrong) {
                        const displayFirstName = assignment.assignedFirstName || me.firstName || '';
                        const displayLastName = assignment.assignedLastName || '';
                        this.logger.log(`Updating persona name/lastName for ${doc.mobile}`);
                        await (0, base_client_service_1.performOrganicActivity)(telegramClient, 'medium');
                        await telegramClient.client.invoke(new telegram_1.Api.account.UpdateProfile({
                            firstName: displayFirstName,
                            lastName: displayLastName,
                        }));
                        updateCount++;
                        await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(5000, 1000, 3000, 7000));
                    }
                    if (assignment.assignedBio != null && currentBio !== assignment.assignedBio) {
                        this.logger.log(`Updating persona bio for ${doc.mobile}`);
                        await (0, base_client_service_1.performOrganicActivity)(telegramClient, 'light');
                        await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(12500, 3000, 8000, 18000));
                        await telegramClient.client.invoke(new telegram_1.Api.account.UpdateProfile({ about: assignment.assignedBio }));
                        updateCount++;
                    }
                }
            }
            else {
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
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
            return updateCount;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating profile', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.deactivateClient(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async updateUsername(doc, client, failedAttempts) {
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
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, base_client_service_1.performOrganicActivity)(telegramClient, 'light');
            const me = await telegramClient.getMe();
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
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
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
            return 1;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating username', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.deactivateClient(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async create(bufferClient) {
        const canonicalMobile = this.canonicalMobile(bufferClient.mobile);
        const createData = { ...bufferClient, mobile: canonicalMobile };
        const result = await this.bufferClientModel.create({
            ...createData,
            status: bufferClient.status || 'active',
        });
        this.logger.log(`Buffer Client Created:\n\nMobile: ${canonicalMobile}`);
        await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, [
            '<b>Buffer Client Created</b>',
            '',
            `<b>Mobile:</b> ${canonicalMobile}`,
            `<b>Client ID:</b> ${bufferClient.clientId || '-'}`,
            `<b>Status:</b> ${result.status}`,
            `<b>Available Date:</b> ${bufferClient.availableDate || '-'}`,
            `<b>Channels:</b> ${bufferClient.channels ?? '-'}`,
            `<b>Message:</b> ${bufferClient.message || '-'}`,
        ].join('\n'), { parseMode: 'HTML' });
        return result;
    }
    async findAll(status) {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }
    async findOne(mobile, throwErr = true) {
        const canonicalMobile = this.canonicalMobile(mobile);
        const bufferClient = (await this.bufferClientModel.findOne({ mobile: canonicalMobile }).exec())?.toJSON() || null;
        if (!bufferClient && throwErr) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return bufferClient;
    }
    async existsByMobile(mobile) {
        const canonicalMobile = this.canonicalMobile(mobile);
        return !!(await this.bufferClientModel.findOne({ mobile: canonicalMobile }, { _id: 1 }).lean().exec());
    }
    async update(mobile, updateClientDto) {
        const canonicalMobile = this.canonicalMobile(mobile);
        const updateData = { ...updateClientDto };
        if (updateData.mobile !== undefined) {
            const payloadMobile = this.canonicalMobile(updateData.mobile);
            if (payloadMobile !== canonicalMobile) {
                throw new common_1.BadRequestException('mobile in payload must match route mobile');
            }
            updateData.mobile = canonicalMobile;
        }
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate({ mobile: canonicalMobile }, { $set: updateData }, { new: true, returnDocument: 'after' })
            .exec();
        if (!updatedBufferClient) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return updatedBufferClient;
    }
    async createOrUpdate(mobile, createorUpdateBufferClientDto) {
        const canonicalMobile = this.canonicalMobile(mobile);
        if (await this.existsByMobile(canonicalMobile)) {
            const updateDto = {
                ...createorUpdateBufferClientDto,
                mobile: canonicalMobile,
            };
            return this.update(canonicalMobile, updateDto);
        }
        else {
            const createDto = {
                ...createorUpdateBufferClientDto,
                mobile: canonicalMobile,
                status: createorUpdateBufferClientDto.status || 'active',
            };
            return this.create(createDto);
        }
    }
    async remove(mobile, message) {
        try {
            const canonicalMobile = this.canonicalMobile(mobile);
            const bufferClient = await this.findOne(canonicalMobile, false);
            if (!bufferClient) {
                throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing BufferClient with mobile: ${canonicalMobile}`);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Buffer Client\n\nMobile: ${canonicalMobile}\nReason: ${message || 'manual removal'}`)}`);
            await this.bufferClientModel.deleteOne({ mobile: canonicalMobile }).exec();
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `failed to delete BufferClient: ${mobile}`);
            this.logger.error(`Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }
    async search(filter) {
        if (filter.tgId === "refresh") {
            this.updateAllClientSessions().catch((error) => {
                this.logger.error('Error updating all client sessions:', error);
            });
            return [];
        }
        const query = { ...filter };
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
    async executeQuery(query, sort, limit, skip) {
        if (!query) {
            throw new common_1.BadRequestException('Query is invalid.');
        }
        try {
            const queryExec = this.bufferClientModel.find(query);
            if (sort)
                queryExec.sort(sort);
            if (limit)
                queryExec.limit(limit);
            if (skip)
                queryExec.skip(skip);
            return await queryExec.exec();
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException)
                throw error;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new common_1.InternalServerErrorException(`Query execution failed: ${errorMessage}`);
        }
    }
    async updateStatus(mobile, status, message) {
        const updateData = { status };
        if (message)
            updateData.message = message;
        if (status === 'inactive') {
            updateData.inUse = false;
        }
        try {
            const updated = await this.update(mobile, updateData);
            this.logger.log(`Buffer client ${mobile} status updated to ${status}`);
            this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `<b>Buffer Client Status Update</b>\n\n<b>Mobile:</b> ${mobile}\n<b>New Status:</b> ${status}\n<b>Reason:</b> ${message || '-'}`, { parseMode: 'HTML' }).catch((error) => this.logger.error(`Failed to send buffer status success notification for ${mobile}: ${error instanceof Error ? error.message : String(error)}`));
            return updated;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to update buffer client ${mobile} status to ${status}: ${errorMessage}`);
            this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `<b>Buffer Client Status Update Failed</b>\n\n<b>Mobile:</b> ${mobile}\n<b>Attempted Status:</b> ${status}\n<b>Reason:</b> ${message || '-'}\n<b>Error:</b> ${errorMessage}`, { parseMode: 'HTML' }).catch((notifyError) => this.logger.error(`Failed to send buffer status failure notification for ${mobile}: ${notifyError instanceof Error ? notifyError.message : String(notifyError)}`));
            throw error;
        }
    }
    async setPrimaryInUse(clientId, mobile) {
        const now = new Date();
        const revoked = await this.bufferClientModel.updateMany({
            clientId,
            mobile: { $ne: mobile },
            inUse: true,
        }, {
            $set: {
                inUse: false,
                lastUsed: now,
            },
        }).exec();
        if ((revoked.modifiedCount || 0) > 0) {
            this.logger.info(`Revoked stale in-use buffer ownership for ${clientId}`, {
                keepMobile: mobile,
                revokedCount: revoked.modifiedCount,
            });
            await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, [
                '<b>Buffer Primary Reassigned</b>',
                '',
                `<b>Client ID:</b> ${clientId}`,
                `<b>Primary Mobile:</b> ${mobile}`,
                `<b>Revoked In-Use:</b> ${revoked.modifiedCount}`,
            ].join('\n'), { parseMode: 'HTML' });
        }
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate({ mobile, clientId }, {
            $set: {
                inUse: true,
                status: 'active',
                lastUsed: now,
            },
        }, { new: true, returnDocument: 'after' })
            .exec();
        if (!updatedBufferClient) {
            throw new common_1.NotFoundException(`Primary buffer client ${mobile} for ${clientId} not found`);
        }
        this.logger.info(`Set primary in-use buffer client for ${clientId}`, {
            mobile,
        });
        return updatedBufferClient;
    }
    async refillJoinQueue(clientId) {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing)
            return 0;
        if (this.telegramService.hasActiveClientSetup())
            return 0;
        this.resetDailyJoinCountersIfNeeded();
        const primaryClientMobiles = await this.getPrimaryClientMobiles(clientId);
        const excludedMobiles = new Set([
            ...this.joinChannelMap.keys(),
            ...primaryClientMobiles,
        ]);
        const query = {
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(excludedMobiles) },
        };
        if (clientId)
            query.clientId = clientId;
        this.logger.debug('Refill join queue query prepared', {
            clientId: clientId || 'all',
            excludedCount: excludedMobiles.size,
        });
        const eligible = await this.bufferClientModel
            .find(query)
            .sort({ channels: -1 })
            .limit(this.config.maxMapSize)
            .exec();
        let added = 0;
        let leaveAdded = 0;
        for (const doc of eligible) {
            if (this.isPrimaryClientMobile(doc.mobile, primaryClientMobiles)) {
                this.logger.debug(`Skipping refill candidate ${doc.mobile}: it is the live client mobile`);
                continue;
            }
            if (this.isMobileDailyCapped(doc.mobile))
                continue;
            try {
                const client = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
                const channels = await (0, channelinfo_1.channelInfo)(client.client, true);
                await this.update(doc.mobile, { channels: channels.ids.length });
                if (channels.canSendFalseCount < 10) {
                    const remaining = this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(doc.mobile);
                    const channelsToJoin = await this.fetchJoinableChannels(channels.ids.length, remaining, channels.ids);
                    if (channelsToJoin.length === 0)
                        continue;
                    if (this.safeSetJoinChannelMap(doc.mobile, channelsToJoin)) {
                        added++;
                    }
                }
                else if (!this.leaveChannelMap.has(doc.mobile)) {
                    if (this.safeSetLeaveChannelMap(doc.mobile, channels.canSendFalseChats)) {
                        leaveAdded++;
                    }
                }
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `RefillJoinQueueErr: ${doc.mobile}`);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.deactivateClient(doc.mobile, reason);
                }
            }
            finally {
                await this.safeUnregisterClient(doc.mobile);
            }
        }
        if (added > 0) {
            this.logger.log(`Refilled join queue with ${added} buffer clients`);
        }
        if (leaveAdded > 0 && !this.leaveChannelIntervalId) {
            this.createTimeout(() => this.leaveChannelQueue(), client_helper_utils_1.ClientHelperUtils.gaussianRandom(6500, 1000, 5000, 8000));
        }
        return added;
    }
    async fetchJoinableChannels(currentChannels, limit, excludedIds) {
        const capped = Math.min(limit, 25);
        if (capped <= 0)
            return [];
        return currentChannels < 220
            ? this.activeChannelsService.getActiveChannels(capped, 0, excludedIds)
            : this.channelsService.getActiveChannels(capped, 0, excludedIds);
    }
    async markAsActive(mobile, message = 'Account is functioning properly') {
        return this.updateStatus(mobile, 'active', message);
    }
    async markAsInactive(mobile, reason) {
        try {
            this.logger.log(`Marking buffer client ${mobile} as inactive: ${reason}`);
            return await this.updateStatus(mobile, 'inactive', reason);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to mark buffer client ${mobile} as inactive: ${errorMessage}`);
            return null;
        }
    }
    async setAsBufferClient(mobile, clientId, availableDate = client_helper_utils_1.ClientHelperUtils.getTodayDateString()) {
        const canonicalMobile = this.canonicalMobile(mobile);
        const user = (await this.usersService.search({ mobile: canonicalMobile, expired: false }))[0];
        if (!user)
            throw new common_1.BadRequestException('user not found');
        const isExist = await this.findOne(canonicalMobile, false);
        if (isExist)
            throw new common_1.ConflictException('BufferClient already exist');
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        if (clientMobiles.some((clientMobile) => this.mobilesMatch(clientMobile, canonicalMobile)))
            throw new common_1.BadRequestException('Number is an Active Client');
        const telegramClient = await connection_manager_1.connectionManager.getClient(canonicalMobile, { autoDisconnect: false });
        try {
            const channels = await this.telegramService.getChannelInfo(canonicalMobile, true);
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            const bufferClient = {
                tgId: user.tgId,
                session: user.session,
                mobile: canonicalMobile,
                availableDate,
                channels: channels.ids.length,
                clientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };
            await this.bufferClientModel
                .findOneAndUpdate({ mobile: canonicalMobile }, {
                $set: {
                    ...bufferClient,
                    warmupPhase: base_client_service_1.WarmupPhase.ENROLLED,
                    warmupJitter: client_helper_utils_1.ClientHelperUtils.generateWarmupJitter(),
                    enrolledAt: new Date(),
                }
            }, { new: true, upsert: true })
                .exec();
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to set as Buffer Client ${canonicalMobile}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                try {
                    await this.usersService.update(user.tgId, { expired: true });
                }
                catch { }
            }
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        finally {
            await this.safeUnregisterClient(canonicalMobile);
        }
        return 'Client enrolled as buffer successfully';
    }
    async diagnoseEnrollmentDecision() {
        const clients = await this.clientService.findAll();
        const now = Date.now();
        const assignedBufferClients = await this.bufferClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();
        const healthyBufferClientsPerClient = new Map();
        for (const doc of assignedBufferClients) {
            if (!doc.clientId)
                continue;
            if (!this.isHealthyBufferClientForCap(doc, now))
                continue;
            healthyBufferClientsPerClient.set(doc.clientId, (healthyBufferClientsPerClient.get(doc.clientId) || 0) + 1);
        }
        const perClientDecisions = [];
        const clientsNeedingBufferClients = [];
        for (const client of clients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeedsForCurrentState(client.clientId);
            const healthyCount = healthyBufferClientsPerClient.get(client.clientId) || 0;
            const remainingCapacity = Math.max(0, this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT - healthyCount);
            const decision = {
                clientId: client.clientId,
                healthyCount,
                healthyCap: this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT,
                remainingCapacity,
                readyActive: availabilityNeeds.readyActive,
                warmingPipeline: availabilityNeeds.warmingPipeline,
                totalActive: availabilityNeeds.totalActive,
                totalNeeded: availabilityNeeds.totalNeeded,
                calculationReason: availabilityNeeds.calculationReason,
                priority: availabilityNeeds.priority,
                replenishmentWindows: availabilityNeeds.replenishmentWindowNeeds,
                shortTermWindows: availabilityNeeds.windowNeeds,
            };
            if (availabilityNeeds.totalNeeded > 0 && remainingCapacity > 0) {
                const cappedNeeded = Math.min(availabilityNeeds.totalNeeded, remainingCapacity);
                decision.wouldEnroll = cappedNeeded;
                decision.cappedReason = cappedNeeded < availabilityNeeds.totalNeeded
                    ? `capped from ${availabilityNeeds.totalNeeded} to ${cappedNeeded} by healthy cap`
                    : null;
                clientsNeedingBufferClients.push({
                    clientId: client.clientId,
                    totalNeeded: cappedNeeded,
                    priority: availabilityNeeds.priority,
                });
            }
            else if (availabilityNeeds.totalNeeded > 0) {
                decision.wouldEnroll = 0;
                decision.blockedReason = `healthy cap reached (${healthyCount}/${this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT})`;
            }
            else {
                decision.wouldEnroll = 0;
                decision.blockedReason = 'no deficit in replenishment windows';
            }
            perClientDecisions.push(decision);
        }
        clientsNeedingBufferClients.sort((a, b) => a.priority - b.priority);
        let totalSlotsNeeded = 0;
        const allocations = [];
        for (const clientNeed of clientsNeedingBufferClients) {
            const allocated = Math.min(clientNeed.totalNeeded, this.config.maxNewClientsPerTrigger - totalSlotsNeeded);
            if (allocated > 0) {
                totalSlotsNeeded += allocated;
                allocations.push({ clientId: clientNeed.clientId, allocated, priority: clientNeed.priority });
            }
            if (totalSlotsNeeded >= this.config.maxNewClientsPerTrigger)
                break;
        }
        const promoteClients = await this.promoteClientService.findAll();
        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferMobiles = assignedBufferClients.map((doc) => doc.mobile);
        const goodIds = [
            ...clientMainMobiles,
            ...promoteClients.map((c) => c.mobile),
            ...assignedBufferMobiles,
        ].filter((id) => typeof id === 'string' && id.length > 0);
        const threeMonthsAgo = client_helper_utils_1.ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);
        const eligibleUserCount = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: threeMonthsAgo },
            totalChats: { $gt: 150 },
        }, { _id: 1 }, totalSlotsNeeded + 5);
        return {
            maxNewClientsPerTrigger: this.config.maxNewClientsPerTrigger,
            minTotalClients: this.config.minTotalClients,
            healthyCapPerClient: this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT,
            totalClientsNeedingEnrollment: clientsNeedingBufferClients.length,
            totalSlotsRequested: clientsNeedingBufferClients.reduce((s, c) => s + c.totalNeeded, 0),
            totalSlotsAllocated: totalSlotsNeeded,
            eligibleUsersAvailable: eligibleUserCount.length,
            wouldCreate: Math.min(totalSlotsNeeded, eligibleUserCount.length),
            allocations,
            perClientDecisions: perClientDecisions.sort((a, b) => b.totalNeeded - a.totalNeeded),
        };
    }
    async diagnoseWarmupPipeline() {
        const clients = await this.clientService.findAll();
        const clientMap = new Map(clients.map((c) => [c.clientId, c]));
        const now = Date.now();
        const allActive = await this.bufferClientModel
            .find({ status: 'active', clientId: { $exists: true, $ne: null } })
            .exec();
        const phaseCounts = {};
        const actionCounts = {};
        const skippedReasons = {};
        const wouldProcess = [];
        const settlingDetails = [];
        for (const bc of allActive) {
            const warmupPhase = bc.warmupPhase || base_client_service_1.WarmupPhase.ENROLLED;
            phaseCounts[warmupPhase] = (phaseCounts[warmupPhase] || 0) + 1;
            const client = clientMap.get(bc.clientId);
            if (!client) {
                skippedReasons['no_client'] = (skippedReasons['no_client'] || 0) + 1;
                continue;
            }
            const lastUsed = client_helper_utils_1.ClientHelperUtils.getTimestamp(bc.lastUsed);
            if (lastUsed > 0 && warmupPhase === base_client_service_1.WarmupPhase.SESSION_ROTATED) {
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
            const lastFailureTime = client_helper_utils_1.ClientHelperUtils.getTimestamp(bc.lastUpdateFailure);
            let processSkipReason = null;
            if (failedAttempts > 0 && (lastFailureTime <= 0 || now - lastFailureTime > this.FAILURE_RESET_DAYS * this.ONE_DAY_MS)) {
                const enrolledTs = client_helper_utils_1.ClientHelperUtils.getTimestamp(bc.enrolledAt) || client_helper_utils_1.ClientHelperUtils.getTimestamp(bc.createdAt);
                const daysSinceEnrolled = enrolledTs > 0 ? (now - enrolledTs) / this.ONE_DAY_MS : 0;
                if (daysSinceEnrolled > 45 && warmupPhase !== base_client_service_1.WarmupPhase.SESSION_ROTATED && warmupPhase !== base_client_service_1.WarmupPhase.READY) {
                    processSkipReason = `zombie_${Math.round(daysSinceEnrolled)}d`;
                }
            }
            else if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
                const retryBackoffMs = this.FAILURE_RETRY_BACKOFF_HOURS * 60 * 60 * 1000;
                if (lastFailureTime > 0 && now - lastFailureTime < retryBackoffMs) {
                    processSkipReason = `failed_${failedAttempts}_backoff`;
                }
            }
            const warmupAction = (0, base_client_service_1.getWarmupPhaseAction)(bc, now);
            const lastAttemptAge = bc.lastUpdateAttempt ? Math.round((now - new Date(bc.lastUpdateAttempt).getTime()) / (60 * 60 * 1000)) : null;
            const lastUpdateAttempt = bc.lastUpdateAttempt ? new Date(bc.lastUpdateAttempt).getTime() : 0;
            const lastAttemptAgeHours = lastUpdateAttempt > 0
                ? (now - lastUpdateAttempt) / (60 * 60 * 1000)
                : 10000;
            const computedPhase = warmupAction.phase;
            const phaseBoost = {
                [base_client_service_1.WarmupPhase.READY]: 25000, [base_client_service_1.WarmupPhase.MATURING]: 15000, [base_client_service_1.WarmupPhase.GROWING]: 10000,
                [base_client_service_1.WarmupPhase.IDENTITY]: 7000, [base_client_service_1.WarmupPhase.SETTLING]: 5000, [base_client_service_1.WarmupPhase.ENROLLED]: 3000,
                [base_client_service_1.WarmupPhase.SESSION_ROTATED]: 0,
            };
            const subStepBonus = {
                'remove_other_auths': 2000, 'set_2fa': 1000, 'update_username': 1500,
                'update_name_bio': 1000, 'upload_photo': 1000, 'rotate_session': 2000,
            };
            const actionBonus = subStepBonus[warmupAction.action] || 0;
            const cappedFailurePenalty = Math.min(failedAttempts, 20) * 100;
            const cappedAgeBonus = Math.min(lastAttemptAgeHours, 168);
            const priority = (phaseBoost[computedPhase] || 5000) + actionBonus + cappedAgeBonus - cappedFailurePenalty;
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
            if (warmupAction.phase === base_client_service_1.WarmupPhase.SETTLING) {
                settlingDetails.push(entry);
            }
            wouldProcess.push(entry);
        }
        wouldProcess.sort((a, b) => b.priority - a.priority);
        let simUpdates = 0;
        const simProcessed = [];
        const simSkipped = [];
        for (const entry of wouldProcess) {
            if (simUpdates >= this.MAX_UPDATES_PER_CYCLE) {
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
            if (isMutation)
                simUpdates++;
        }
        return {
            totalActive: allActive.length,
            phaseCounts,
            actionCounts,
            skippedReasons,
            maxUpdatesPerCycle: this.MAX_UPDATES_PER_CYCLE,
            eligibleToProcess: wouldProcess.length,
            simulation: {
                totalMutationSlots: this.MAX_UPDATES_PER_CYCLE,
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
                }, {}),
                sampleNeedingPrivacy: settlingDetails.filter(s => s.action === 'set_privacy').slice(0, 5),
                sampleNeedingRemoveAuths: settlingDetails.filter(s => s.action === 'remove_other_auths').slice(0, 5),
            },
            skippedBySlotLimit: simSkipped.filter(s => s.reason === 'slot_limit_reached').slice(0, 10),
        };
    }
    async checkBufferClients() {
        if (this.isCheckingBufferClients) {
            this.logger.warn('checkBufferClients already in progress, skipping concurrent call');
            return;
        }
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return;
        }
        this.isCheckingBufferClients = true;
        try {
            await this._checkBufferClientsInternal();
        }
        catch (error) {
            const errMsg = (0, parseError_1.parseError)(error, 'checkBufferClients').message;
            this.logger.error(`checkBufferClients crashed: ${errMsg}`);
            try {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`⚠️ checkBufferClients CRASHED\n\n${errMsg}`)}`);
            }
            catch { }
        }
        finally {
            this.isCheckingBufferClients = false;
        }
    }
    async _checkBufferClientsInternal() {
        const clients = await this.clientService.findAll();
        const promoteClients = await this.promoteClientService.findAll();
        const clientMap = new Map(clients.map((client) => [client.clientId, client]));
        const now = Date.now();
        await this.selfHealLegacyOperationalState();
        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferClients = await this.bufferClientModel
            .find({ clientId: { $exists: true, $ne: null }, status: 'active' })
            .exec();
        const allBufferClientMobiles = (await this.bufferClientModel.find({}, { mobile: 1 }).lean().exec()).map((doc) => doc.mobile);
        const goodIds = [
            ...clientMainMobiles,
            ...promoteClients.map((c) => c.mobile),
            ...allBufferClientMobiles,
        ].filter((id) => typeof id === 'string' && id.length > 0);
        const healthyBufferClientsPerClient = new Map();
        for (const doc of assignedBufferClients) {
            if (!doc.clientId)
                continue;
            if (!this.isHealthyBufferClientForCap(doc, now))
                continue;
            healthyBufferClientsPerClient.set(doc.clientId, (healthyBufferClientsPerClient.get(doc.clientId) || 0) + 1);
        }
        let totalUpdates = 0;
        const updatedEntries = [];
        this.logger.debug(`Checking buffer clients, good IDs count: ${goodIds.length}`);
        const bufferClientsToProcess = [];
        for (const bufferClient of assignedBufferClients) {
            if (!bufferClient.clientId)
                continue;
            const client = clientMap.get(bufferClient.clientId);
            if (!client)
                continue;
            if (bufferClient.mobile === client.mobile) {
                this.logger.debug(`Skipping buffer maintenance for ${bufferClient.mobile}: currently attached as primary client mobile`);
                continue;
            }
            if (bufferClient.inUse === true)
                continue;
            const lastUpdateAttempt = bufferClient.lastUpdateAttempt ? new Date(bufferClient.lastUpdateAttempt).getTime() : 0;
            if (this.isOnCooldown(bufferClient.mobile, bufferClient.lastUpdateAttempt, now))
                continue;
            const lastUsed = client_helper_utils_1.ClientHelperUtils.getTimestamp(bufferClient.lastUsed);
            const warmupPhase = bufferClient.warmupPhase || base_client_service_1.WarmupPhase.ENROLLED;
            if (lastUsed > 0 && warmupPhase === base_client_service_1.WarmupPhase.SESSION_ROTATED) {
                await this.backfillTimestamps(bufferClient.mobile, bufferClient, now);
                continue;
            }
            const failedAttempts = bufferClient.failedUpdateAttempts || 0;
            const lastAttemptAgeHours = lastUpdateAttempt > 0
                ? (now - lastUpdateAttempt) / (60 * 60 * 1000)
                : 10000;
            const warmupAction = (0, base_client_service_1.getWarmupPhaseAction)(bufferClient, now);
            const computedPhase = warmupAction.phase;
            const phaseBoost = {
                [base_client_service_1.WarmupPhase.READY]: 25000,
                [base_client_service_1.WarmupPhase.MATURING]: 15000,
                [base_client_service_1.WarmupPhase.GROWING]: 10000,
                [base_client_service_1.WarmupPhase.IDENTITY]: 7000,
                [base_client_service_1.WarmupPhase.SETTLING]: 5000,
                [base_client_service_1.WarmupPhase.ENROLLED]: 3000,
                [base_client_service_1.WarmupPhase.SESSION_ROTATED]: 0,
            };
            const subStepBonus = {
                'remove_other_auths': 2000,
                'set_2fa': 1000,
                'update_username': 1500,
                'update_name_bio': 1000,
                'upload_photo': 1000,
                'rotate_session': 2000,
            };
            const warmupBoost = phaseBoost[computedPhase] ?? 5000;
            const actionBonus = subStepBonus[warmupAction.action] || 0;
            const cappedFailurePenalty = Math.min(failedAttempts, 20) * 100;
            const cappedAgeBonus = Math.min(lastAttemptAgeHours, 168);
            const priority = warmupBoost + actionBonus + cappedAgeBonus - cappedFailurePenalty;
            bufferClientsToProcess.push({ bufferClient, client, clientId: bufferClient.clientId, priority });
        }
        bufferClientsToProcess.sort((a, b) => b.priority - a.priority);
        for (const { bufferClient, client } of bufferClientsToProcess) {
            if (totalUpdates >= this.MAX_UPDATES_PER_CYCLE)
                break;
            const warmupPhase = bufferClient.warmupPhase || base_client_service_1.WarmupPhase.ENROLLED;
            if (warmupPhase === base_client_service_1.WarmupPhase.SESSION_ROTATED) {
                const lastChecked = bufferClient.lastChecked ? new Date(bufferClient.lastChecked).getTime() : 0;
                const healthCheck = await this.performHealthCheck(bufferClient.mobile, lastChecked, now);
                if (!healthCheck.passed)
                    continue;
            }
            const processResult = await this.processClient(bufferClient, client);
            if (processResult.updateCount > 0) {
                totalUpdates += processResult.updateCount;
                updatedEntries.push(`${client.clientId} | ${bufferClient.mobile} | ${processResult.updateSummary || 'updated'} | count=${processResult.updateCount}`);
            }
        }
        const clientNeedingBufferClients = [];
        for (const client of clients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeedsForCurrentState(client.clientId);
            if (availabilityNeeds.totalNeeded <= 0)
                continue;
            const healthyCount = healthyBufferClientsPerClient.get(client.clientId) || 0;
            const remainingCapacity = Math.max(0, this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT - healthyCount);
            if (remainingCapacity <= 0) {
                this.logger.debug(`Skipping dynamic buffer enrollment for ${client.clientId}: healthy pool already at cap`, {
                    healthyCount,
                    cap: this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT,
                    requested: availabilityNeeds.totalNeeded,
                });
                continue;
            }
            const cappedNeeded = Math.min(availabilityNeeds.totalNeeded, remainingCapacity);
            clientNeedingBufferClients.push({
                clientId: client.clientId,
                ...availabilityNeeds,
                totalNeeded: cappedNeeded,
                calculationReason: cappedNeeded < availabilityNeeds.totalNeeded
                    ? `${availabilityNeeds.calculationReason}; capped to remaining healthy capacity ${remainingCapacity}/${this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT}`
                    : availabilityNeeds.calculationReason,
            });
        }
        clientNeedingBufferClients.sort((a, b) => a.priority - b.priority);
        let totalSlotsNeeded = 0;
        for (const clientNeed of clientNeedingBufferClients) {
            const allocated = Math.min(clientNeed.totalNeeded, this.config.maxNewClientsPerTrigger - totalSlotsNeeded);
            if (allocated > 0)
                totalSlotsNeeded += allocated;
            if (totalSlotsNeeded >= this.config.maxNewClientsPerTrigger)
                break;
        }
        let dynamicCreateResult = {
            createdCount: 0,
            attemptedCount: 0,
            createdEntries: [],
        };
        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            try {
                dynamicCreateResult = await this.addNewUserstoBufferClientsDynamic([], goodIds, clientNeedingBufferClients, healthyBufferClientsPerClient);
            }
            catch (error) {
                const errMsg = (0, parseError_1.parseError)(error, 'addNewUserstoBufferClientsDynamic').message;
                this.logger.error(`Dynamic buffer enrollment failed: ${errMsg}`);
                try {
                    await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`⚠️ Buffer Enrollment Failed\n\n${errMsg}`)}`);
                }
                catch { }
            }
        }
        await this.sendBufferCheckSummaryNotification(totalUpdates, dynamicCreateResult.createdCount, dynamicCreateResult.attemptedCount, updatedEntries, dynamicCreateResult.createdEntries);
    }
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
                await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(16000, 2500, 12000, 20000));
            }
        }
    }
    async joinchannelForBufferClients(skipExisting = true, clientId) {
        if (this.telegramService.hasActiveClientSetup()) {
            return 'Active client setup exists, skipping';
        }
        this.logger.log('Starting join channel process for buffer clients');
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) {
            this.logger.warn('Join/leave processing still in progress, skipping re-entry');
            return 'Join/leave still processing, skipped';
        }
        this.joinScopeClientId = clientId || null;
        const primaryClientMobiles = await this.getPrimaryClientMobiles(clientId);
        const preservedMobiles = await this.prepareJoinChannelRefresh(skipExisting);
        const query = {
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(new Set([...preservedMobiles, ...primaryClientMobiles])) },
            status: 'active',
        };
        if (clientId)
            query.clientId = clientId;
        this.logger.info('Prepared buffer join-channel sweep', {
            clientId: clientId || 'all',
            preservedCount: preservedMobiles.size,
            primaryClientCount: primaryClientMobiles.size,
        });
        const clients = await this.bufferClientModel.find(query).sort({ channels: 1 }).limit(this.config.maxMapSize);
        const joinSet = new Set();
        const leaveSet = new Set();
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < clients.length; i++) {
            const document = clients[i];
            const mobile = document.mobile;
            try {
                const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                const channels = await (0, channelinfo_1.channelInfo)(client.client, true);
                await this.update(mobile, { channels: channels.ids.length });
                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result = channels.ids.length < 220
                        ? await this.activeChannelsService.getActiveChannels(25, 0, excludedIds)
                        : await this.channelsService.getActiveChannels(25, 0, excludedIds);
                    if (!this.joinChannelMap.has(mobile)) {
                        if (this.safeSetJoinChannelMap(mobile, result)) {
                            joinSet.add(mobile);
                        }
                    }
                }
                else {
                    if (!this.leaveChannelMap.has(mobile)) {
                        if (this.safeSetLeaveChannelMap(mobile, channels.canSendFalseChats)) {
                            leaveSet.add(mobile);
                        }
                    }
                }
                successCount++;
            }
            catch (error) {
                failCount++;
                const errorDetails = (0, parseError_1.parseError)(error, `JoinChannelErr: ${mobile}`);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.deactivateClient(mobile, reason);
                }
            }
            finally {
                await this.safeUnregisterClient(mobile);
                if (i < clients.length - 1) {
                    await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(this.config.clientProcessingDelay + 2500, 1500, this.config.clientProcessingDelay, this.config.clientProcessingDelay + 5000));
                }
            }
        }
        await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 750, 6000, 9000));
        if (joinSet.size > 0) {
            this.createTimeout(() => this.joinChannelQueue(), 4000 + Math.random() * 2000);
        }
        if (leaveSet.size > 0) {
            this.createTimeout(() => this.leaveChannelQueue(), client_helper_utils_1.ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
        }
        return `Buffer Join queued for: ${joinSet.size}, Leave queued for: ${leaveSet.size}`;
    }
    async isMobileEnrolledAnywhere(mobile) {
        const [bufferExists, promoteExists, clientExists] = await Promise.all([
            this.existsByMobile(mobile),
            this.promoteClientService.existsByMobile(mobile),
            this.clientService.findAll().then((clients) => clients.some((c) => this.mobilesMatch(c.mobile, mobile))),
        ]);
        if (bufferExists)
            return 'bufferClients';
        if (promoteExists)
            return 'promoteClients';
        if (clientExists)
            return 'clients';
        return null;
    }
    async createBufferClientFromUser(document, targetClientId, availableDate) {
        const enrolledIn = await this.isMobileEnrolledAnywhere(document.mobile);
        if (enrolledIn) {
            this.logger.debug(`Skipping ${document.mobile}: already enrolled in ${enrolledIn}`);
            return false;
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
        try {
            const hasPassword = await telegramClient.hasPassword();
            if (hasPassword) {
                this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }
            const channels = await (0, channelinfo_1.channelInfo)(telegramClient.client, true);
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            const user = (await this.usersService.search({ mobile: document.mobile }))[0];
            if (!user?.session?.trim()) {
                this.logger.warn(`Skipping buffer enrollment for ${document.mobile}: source user/session missing`);
                return false;
            }
            const targetAvailableDate = availableDate || client_helper_utils_1.ClientHelperUtils.getTodayDateString();
            const bufferClient = {
                tgId: document.tgId,
                session: user.session,
                mobile: document.mobile,
                lastUsed: null,
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Enrolled for warmup',
            };
            await this.bufferClientModel.findOneAndUpdate({ mobile: document.mobile }, {
                $set: {
                    ...bufferClient,
                    warmupPhase: base_client_service_1.WarmupPhase.ENROLLED,
                    warmupJitter: client_helper_utils_1.ClientHelperUtils.generateWarmupJitter(),
                    enrolledAt: new Date(),
                }
            }, { new: true, upsert: true }).exec();
            this.logger.log(`Created BufferClient for ${targetClientId} with availability ${targetAvailableDate}`);
            await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, [
                '<b>Buffer Client Enrolled</b>',
                '',
                `<b>Client ID:</b> ${targetClientId}`,
                `<b>Mobile:</b> ${document.mobile}`,
                `<b>Available Date:</b> ${targetAvailableDate}`,
                `<b>Channels:</b> ${channels.ids.length}`,
                `<b>Warmup Phase:</b> ${base_client_service_1.WarmupPhase.ENROLLED}`,
                `<b>Source TG ID:</b> ${document.tgId}`,
            ].join('\n'), { parseMode: 'HTML' });
            return true;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error processing client', document.mobile);
            this.logger.error(`Error processing buffer client ${document.mobile}: ${errorDetails.message}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.deactivateClient(document.mobile, errorDetails.message);
                try {
                    await this.usersService.update(document.tgId, { expired: true });
                }
                catch { }
            }
            return false;
        }
        finally {
            await this.safeUnregisterClient(document.mobile);
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds, clientsNeedingBufferClients = [], bufferClientsPerClient) {
        const clientNeedingDynamic = [];
        for (const clientId of clientsNeedingBufferClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingDynamic.push({ clientId, ...availabilityNeeds });
            }
        }
        clientNeedingDynamic.sort((a, b) => a.priority - b.priority);
        await this.addNewUserstoBufferClientsDynamic(badIds, goodIds, clientNeedingDynamic, bufferClientsPerClient);
    }
    async addNewUserstoBufferClientsDynamic(badIds, goodIds, clientsNeedingBufferClients, bufferClientsPerClient) {
        const threeMonthsAgo = client_helper_utils_1.ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);
        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingBufferClients) {
            totalNeeded += clientNeed.totalNeeded;
        }
        totalNeeded = Math.min(totalNeeded, this.config.maxNewClientsPerTrigger);
        if (totalNeeded === 0)
            return { createdCount: 0, attemptedCount: 0, createdEntries: [] };
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: threeMonthsAgo },
            totalChats: { $gt: 150 },
        }, { tgId: 1 }, totalNeeded + 5);
        const today = client_helper_utils_1.ClientHelperUtils.getTodayDateString();
        const assignmentQueue = [];
        const projectedHealthyCounts = new Map(bufferClientsPerClient || []);
        for (const clientNeed of clientsNeedingBufferClients) {
            const currentHealthyCount = projectedHealthyCounts.get(clientNeed.clientId) || 0;
            const remainingCapacity = Math.max(0, this.MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT - currentHealthyCount);
            const cappedNeed = Math.min(clientNeed.totalNeeded, remainingCapacity);
            for (let i = 0; i < cappedNeed; i++) {
                assignmentQueue.push({ clientId: clientNeed.clientId, priority: clientNeed.priority });
            }
            if (cappedNeed > 0) {
                projectedHealthyCounts.set(clientNeed.clientId, currentHealthyCount + cappedNeed);
            }
        }
        let attemptedCount = 0;
        let createdCount = 0;
        let assignmentIndex = 0;
        const createdEntries = [];
        const enrolledThisRun = new Set();
        while (attemptedCount < totalNeeded && documents.length > 0 && assignmentIndex < assignmentQueue.length) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId)
                continue;
            if (enrolledThisRun.has(document.mobile)) {
                this.logger.debug(`Skipping ${document.mobile}: already attempted in this enrollment run`);
                continue;
            }
            enrolledThisRun.add(document.mobile);
            const assignment = assignmentQueue[assignmentIndex];
            if (!assignment)
                break;
            try {
                const created = await this.createBufferClientFromUser(document, assignment.clientId, today);
                if (created) {
                    assignmentIndex++;
                    createdCount++;
                    createdEntries.push(`${assignment.clientId} | ${document.mobile}`);
                }
                attemptedCount++;
            }
            catch (error) {
                this.logger.error(`Error creating connection for ${document.mobile}`);
                await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
                attemptedCount++;
            }
        }
        this.logger.log(`Dynamic batch completed: Created ${createdCount} new buffer clients (${attemptedCount} attempted)`);
        return { createdCount, attemptedCount, createdEntries };
    }
    async updateAllClientSessions() {
        const primaryClientMobiles = await this.getPrimaryClientMobiles();
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
                const client = await connection_manager_1.connectionManager.getClient(bufferClient.mobile, { autoDisconnect: false, handler: true });
                try {
                    const hasPassword = await client.hasPassword();
                    if (!hasPassword) {
                        await client.set2fa();
                        await (0, Helpers_1.sleep)(60000 + Math.random() * 30000);
                    }
                    await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
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
                        warmupPhase: base_client_service_1.WarmupPhase.SESSION_ROTATED,
                        sessionRotatedAt: new Date(),
                    });
                }
                catch (error) {
                    const errorDetails = this.handleError(error, 'Failed to create new session', bufferClient.mobile);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.update(bufferClient.mobile, {
                            status: 'inactive',
                            message: `Session update failed: ${errorDetails.message}`,
                        });
                    }
                }
                finally {
                    await this.safeUnregisterClient(bufferClient.mobile);
                    if (i < bufferClients.length - 1) {
                        await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000));
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}`);
                if (i < bufferClients.length - 1)
                    await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000));
            }
        }
    }
    async getBufferClientsByClientId(clientId, status) {
        const filter = { clientId };
        if (status)
            filter.status = status;
        return this.bufferClientModel.find(filter).exec();
    }
    async getBufferClientDistribution() {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);
        const [totalBufferClients, unassignedBufferClients, activeBufferClients, inactiveBufferClients, assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts,] = await Promise.all([
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
        const toMap = (arr) => new Map(arr.map((item) => [item._id, item.count]));
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
                status: (needed === 0 ? 'sufficient' : 'needs_more'),
                neverUsed: neverUsedCountMap.get(client.clientId) || 0,
                usedInLast24Hours: recentlyUsedCountMap.get(client.clientId) || 0,
            });
            if (needed === 0)
                clientsWithSufficient++;
            else {
                clientsNeedingMore++;
                totalNeeded += needed;
            }
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
    async getBufferClientsByStatus(status) {
        return this.bufferClientModel.find({ status }).exec();
    }
    async getBufferClientsWithMessages() {
        return this.bufferClientModel.find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 }).exec();
    }
    async getLeastRecentlyUsedBufferClients(clientId, limit = 1) {
        return await this.getLeastRecentlyUsedClients(clientId, limit);
    }
    async getNextAvailableBufferClient(clientId) {
        const clients = await this.getLeastRecentlyUsedBufferClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }
    async getUnusedBufferClients(hoursAgo = 24, clientId) {
        return await this.getUnusedClients(hoursAgo, clientId);
    }
    async sendBufferCheckSummaryNotification(totalUpdates, createdCount, attemptedCount, updatedEntries, createdEntries) {
        const distribution = await this.getBufferClientDistribution();
        const lines = distribution.distributionPerClient
            .sort((a, b) => a.clientId.localeCompare(b.clientId))
            .map((item) => `${item.clientId}: active=${item.activeCount}, assigned=${item.assignedCount}, inactive=${item.inactiveCount}, needed=${item.needed}, neverUsed=${item.neverUsed}, used24h=${item.usedInLast24Hours}`);
        const updatedLines = updatedEntries.length > 0
            ? ['UpdatedThisRun:', ...updatedEntries.map((entry) => `- ${entry}`), '']
            : ['UpdatedThisRun: none', ''];
        const createdLines = createdEntries.length > 0
            ? ['CreatedThisRunDetails:', ...createdEntries.map((entry) => `- ${entry}`), '']
            : ['CreatedThisRunDetails: none', ''];
        await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, [
            '<b>Buffer Client Check Summary</b>',
            '',
            `<b>Active:</b> ${distribution.activeBufferClients}`,
            `<b>Inactive:</b> ${distribution.inactiveBufferClients}`,
            `<b>Unassigned:</b> ${distribution.unassignedBufferClients}`,
            `<b>Updates Applied:</b> ${totalUpdates}`,
            `<b>Created This Run:</b> ${createdCount}`,
            `<b>Attempted Creates:</b> ${attemptedCount}`,
            `<b>Total Needed:</b> ${distribution.summary.totalBufferClientsNeeded}`,
            `<b>Clients Needing More:</b> ${distribution.summary.clientsNeedingBufferClients}`,
            '',
            ...updatedLines,
            ...createdLines,
            '<b>Per Client Summary:</b>',
            ...lines,
        ].join('\n'), { parseMode: 'HTML' });
    }
};
exports.BufferClientService = BufferClientService;
exports.BufferClientService = BufferClientService = BufferClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('bufferClientModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => promote_client_service_1.PromoteClientService))),
    __param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => session_manager_1.SessionService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        promote_client_service_1.PromoteClientService,
        session_manager_1.SessionService,
        bots_1.BotsService])
], BufferClientService);
//# sourceMappingURL=buffer-client.service.js.map