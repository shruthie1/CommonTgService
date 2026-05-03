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
var PromoteClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteClientService = void 0;
const channels_service_1 = require("../channels/channels.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const promote_client_schema_1 = require("./schemas/promote-client.schema");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const telegram_1 = require("telegram");
const users_service_1 = require("../users/users.service");
const active_channels_service_1 = require("../active-channels/active-channels.service");
const client_service_1 = require("../clients/client.service");
const buffer_client_service_1 = require("../buffer-clients/buffer-client.service");
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
let PromoteClientService = PromoteClientService_1 = class PromoteClientService extends base_client_service_1.BaseClientService {
    constructor(promoteClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, bufferClientServiceRef, sessionService, botsService) {
        super(telegramService, usersService, activeChannelsService, clientService, channelsService, sessionService, botsService, PromoteClientService_1.name);
        this.promoteClientModel = promoteClientModel;
        this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT = 30;
        this.isCheckingPromoteClients = false;
        this.bufferClientService = bufferClientServiceRef;
    }
    get model() {
        return this.promoteClientModel;
    }
    get clientType() {
        return 'promote';
    }
    get config() {
        return {
            joinChannelInterval: 6 * 60 * 1000,
            leaveChannelInterval: 60 * 1000,
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,
            channelTarget: 200,
            maxJoinsPerSession: 8,
            maxNewClientsPerTrigger: 10,
            minTotalClients: 12,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: 8000,
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }
    isHealthyPromoteClientForCap(doc, now) {
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
    async updateNameAndBio(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, base_client_service_1.performOrganicActivity)(telegramClient, 'medium');
            const me = await telegramClient.getMe();
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            let updateCount = 0;
            if ((client.firstNames?.length > 0) || (client.promoteLastNames?.length > 0) || (client.bios?.length > 0) || (client.profilePics?.length > 0)) {
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
                        lastNames: client.promoteLastNames || [],
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
                    const currentLastName = fullUser?.users?.[0]?.lastName || '';
                    const currentBio = fullUser?.fullUser?.about || '';
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
                this.logger.warn(`No persona assignment for ${doc.mobile} — marking name/bio step done with current profile`);
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
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async updateUsername(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, base_client_service_1.performOrganicActivity)(telegramClient, 'light');
            await this.telegramService.updateUsername(doc.mobile, '');
            await this.update(doc.mobile, {
                usernameUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Cleared username for ${doc.mobile}`);
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
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async create(promoteClient) {
        const promoteClientData = {
            ...promoteClient,
            status: promoteClient.status || 'active',
            message: promoteClient.message || 'Account is functioning properly',
        };
        const newUser = new this.promoteClientModel(promoteClientData);
        const result = await newUser.save();
        await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, [
            '<b>Promote Client Created</b>',
            '',
            `<b>Mobile:</b> ${promoteClient.mobile}`,
            `<b>Client ID:</b> ${promoteClient.clientId || '-'}`,
            `<b>Status:</b> ${result.status}`,
            `<b>Available Date:</b> ${promoteClient.availableDate || '-'}`,
            `<b>Channels:</b> ${promoteClient.channels ?? '-'}`,
            `<b>Message:</b> ${promoteClient.message || '-'}`,
        ].join('\n'), { parseMode: 'HTML' });
        return result;
    }
    async findAll(statusFilter) {
        const filter = statusFilter ? { status: statusFilter } : {};
        return this.promoteClientModel.find(filter).exec();
    }
    async findOne(mobile, throwErr = true) {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user;
    }
    async existsByMobile(mobile) {
        return !!(await this.promoteClientModel.findOne({ mobile }, { _id: 1 }).lean().exec());
    }
    async update(mobile, updateClientDto) {
        const updatedUser = await this.promoteClientModel
            .findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, returnDocument: 'after' })
            .exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return updatedUser;
    }
    async updateStatus(mobile, status, message) {
        const updateData = { status };
        if (message)
            updateData.message = message;
        if (status === 'inactive') {
            updateData.inUse = false;
        }
        await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `<b>Promote Client Status Update</b>\n\n<b>Mobile:</b> ${mobile}\n<b>New Status:</b> ${status}\n<b>Reason:</b> ${message || '-'}`, { parseMode: 'HTML' });
        return this.update(mobile, updateData);
    }
    async refillJoinQueue(clientId) {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing)
            return 0;
        if (this.telegramService.hasActiveClientSetup())
            return 0;
        this.resetDailyJoinCountersIfNeeded();
        const query = {
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(this.joinChannelMap.keys()) },
        };
        if (clientId)
            query.clientId = clientId;
        const eligible = await this.promoteClientModel
            .find(query)
            .sort({ channels: -1 })
            .limit(this.config.maxMapSize)
            .exec();
        let added = 0;
        let leaveAdded = 0;
        for (const doc of eligible) {
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
                    await this.markAsInactive(doc.mobile, reason);
                }
            }
            finally {
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
    async fetchJoinableChannels(currentChannels, limit, excludedIds) {
        const capped = Math.min(limit, 25);
        if (capped <= 0)
            return [];
        return currentChannels < 220
            ? this.activeChannelsService.getActiveChannels(capped, 0, excludedIds)
            : this.channelsService.getActiveChannels(capped, 0, excludedIds);
    }
    async updateLastUsed(mobile) {
        return this.update(mobile, { lastUsed: new Date() });
    }
    async markAsInactive(mobile, reason) {
        this.logger.log(`Marking promote client ${mobile} as inactive: ${reason}`);
        try {
            return await this.updateStatus(mobile, 'inactive', reason);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to mark promote client ${mobile} as inactive: ${errorMessage}`);
            return null;
        }
    }
    async markAsActive(mobile, message = 'Account is functioning properly') {
        return this.updateStatus(mobile, 'active', message);
    }
    async createOrUpdate(mobile, createOrUpdateUserDto) {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            return this.update(existingUser.mobile, createOrUpdateUserDto);
        }
        else {
            return this.create(createOrUpdateUserDto);
        }
    }
    async remove(mobile, message) {
        try {
            const deleteResult = await this.promoteClientModel.deleteOne({ mobile }).exec();
            if (deleteResult.deletedCount === 0) {
                throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Promote Client\n\nService: ${process.env.serviceName || process.env.clientId || 'unknown'}\nMobile: ${mobile}\nReason: ${message || 'manual removal'}`)}`);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException)
                throw error;
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
    }
    async search(filter) {
        const query = { ...filter };
        const regexFields = ['mobile', 'clientId'];
        for (const field of regexFields) {
            if (typeof query[field] === 'string' && query[field]) {
                query[field] = { $regex: new RegExp(query[field].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
            }
        }
        return this.promoteClientModel.find(query).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        if (!query)
            throw new common_1.BadRequestException('Query is invalid.');
        try {
            const queryExec = this.promoteClientModel.find(query);
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
    async setAsPromoteClient(mobile, clientId, availableDate = client_helper_utils_1.ClientHelperUtils.getTodayDateString()) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user)
            throw new common_1.BadRequestException('User not found');
        const isExist = await this.findOne(mobile, false);
        if (isExist)
            throw new common_1.ConflictException('PromoteClient already exists');
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        if (clientMobiles.includes(mobile))
            throw new common_1.BadRequestException('Number is an Active Client');
        let targetClientId = clientId;
        if (!targetClientId && clients.length > 0) {
            const counts = await this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]);
            const countMap = new Map(counts.map((c) => [c._id, c.count]));
            let minCount = Infinity;
            for (const c of clients) {
                const count = countMap.get(c.clientId) || 0;
                if (count < minCount) {
                    minCount = count;
                    targetClientId = c.clientId;
                }
            }
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
        try {
            const channels = await this.telegramService.getChannelInfo(mobile, true);
            const promoteClient = {
                tgId: user.tgId,
                lastActive: 'default',
                mobile: user.mobile,
                session: user.session,
                availableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };
            await this.promoteClientModel
                .findOneAndUpdate({ mobile: user.mobile }, {
                $set: {
                    ...promoteClient,
                    warmupPhase: base_client_service_1.WarmupPhase.ENROLLED,
                    warmupJitter: client_helper_utils_1.ClientHelperUtils.generateWarmupJitter(),
                    enrolledAt: new Date(),
                }
            }, { new: true, upsert: true })
                .exec();
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                try {
                    await this.usersService.update(user.tgId, { expired: true });
                }
                catch { }
            }
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        finally {
            await this.safeUnregisterClient(mobile);
        }
        return 'Client enrolled as promote successfully';
    }
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
                await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(16000, 2500, 12000, 20000));
            }
        }
    }
    async joinchannelForPromoteClients(skipExisting = true) {
        if (this.telegramService.hasActiveClientSetup()) {
            return 'Active client setup exists, skipping promotion';
        }
        this.logger.log('Starting join channel process');
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
            const joinSet = new Set();
            const leaveSet = new Set();
            let successCount = 0;
            let failCount = 0;
            for (const document of clients) {
                const mobile = document.mobile;
                try {
                    const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                    const channels = await (0, channelinfo_1.channelInfo)(client.client, true);
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                    await this.update(mobile, { channels: channels.ids.length });
                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = channels.ids;
                        await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                        const isBelowThreshold = channels.ids.length < 220;
                        const result = isBelowThreshold
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
                    const errorDetails = (0, parseError_1.parseError)(error);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await (0, Helpers_1.sleep)(1000);
                        const reason = await this.buildPermanentAccountReason(errorDetails.message);
                        await this.markAsInactive(mobile, reason);
                    }
                }
                finally {
                    await this.safeUnregisterClient(mobile);
                    await (0, Helpers_1.sleep)(this.config.clientProcessingDelay + Math.random() * 5000);
                }
            }
            await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
            if (joinSet.size > 0) {
                this.createTimeout(() => this.joinChannelQueue(), 2000);
            }
            if (leaveSet.size > 0) {
                this.createTimeout(() => this.leaveChannelQueue(), 5000);
            }
            return `Initiated Joining channels for ${joinSet.size} | Queued for leave: ${leaveSet.size}`;
        }
        catch (error) {
            this.logger.error('Unexpected error during joinchannelForPromoteClients:', error);
            this.joinChannelMap.clear();
            this.leaveChannelMap.clear();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            throw new Error('Failed to initiate channel joining process');
        }
    }
    async checkPromoteClients() {
        if (this.isCheckingPromoteClients) {
            this.logger.warn('checkPromoteClients already in progress, skipping concurrent call');
            return;
        }
        if (this.telegramService.hasActiveClientSetup()) {
            this.logger.warn('Ignored active check promote channels as active client setup exists');
            return;
        }
        this.isCheckingPromoteClients = true;
        try {
            await this._checkPromoteClientsInternal();
        }
        catch (error) {
            const errMsg = (0, parseError_1.parseError)(error, 'checkPromoteClients').message;
            this.logger.error(`checkPromoteClients crashed: ${errMsg}`);
            try {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`⚠️ checkPromoteClients CRASHED\n\n${errMsg}`)}`);
            }
            catch { }
        }
        finally {
            this.isCheckingPromoteClients = false;
        }
    }
    async _checkPromoteClientsInternal() {
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
        const allPromoteClientMobiles = (await this.promoteClientModel.find({}, { mobile: 1 }).lean().exec()).map((doc) => doc.mobile);
        const goodIds = [...clientMainMobiles, ...bufferClientIds, ...allPromoteClientMobiles].filter((id) => typeof id === 'string' && id.length > 0);
        const healthyPromoteClientsPerClient = new Map();
        for (const doc of assignedPromoteClients) {
            if (!doc.clientId)
                continue;
            if (!this.isHealthyPromoteClientForCap(doc, now))
                continue;
            healthyPromoteClientsPerClient.set(doc.clientId, (healthyPromoteClientsPerClient.get(doc.clientId) || 0) + 1);
        }
        let totalUpdates = 0;
        const updatedEntries = [];
        const promoteClientsToProcess = [];
        for (const promoteClient of assignedPromoteClients) {
            if (!promoteClient.clientId)
                continue;
            const client = clientMap.get(promoteClient.clientId);
            if (!client)
                continue;
            if (promoteClient.inUse === true)
                continue;
            const lastUpdateAttempt = promoteClient.lastUpdateAttempt ? new Date(promoteClient.lastUpdateAttempt).getTime() : 0;
            if (this.isOnCooldown(promoteClient.mobile, promoteClient.lastUpdateAttempt, now))
                continue;
            const warmupPhase = promoteClient.warmupPhase || base_client_service_1.WarmupPhase.ENROLLED;
            const hasBeenUsed = promoteClient.lastUsed && new Date(promoteClient.lastUsed).getTime() > 0;
            if (hasBeenUsed && warmupPhase === base_client_service_1.WarmupPhase.SESSION_ROTATED) {
                await this.backfillTimestamps(promoteClient.mobile, promoteClient, now);
                continue;
            }
            const failedAttempts = promoteClient.failedUpdateAttempts || 0;
            const lastAttemptAgeHours = lastUpdateAttempt > 0
                ? (now - lastUpdateAttempt) / (60 * 60 * 1000)
                : 10000;
            const warmupAction = (0, base_client_service_1.getWarmupPhaseAction)(promoteClient, now);
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
            promoteClientsToProcess.push({ promoteClient: promoteClient, client, clientId: promoteClient.clientId, priority });
        }
        promoteClientsToProcess.sort((a, b) => b.priority - a.priority);
        for (const { promoteClient, client } of promoteClientsToProcess) {
            if (totalUpdates >= this.MAX_UPDATES_PER_CYCLE)
                break;
            const warmupPhase = promoteClient.warmupPhase || base_client_service_1.WarmupPhase.ENROLLED;
            if (warmupPhase === base_client_service_1.WarmupPhase.SESSION_ROTATED) {
                const lastChecked = promoteClient.lastChecked ? new Date(promoteClient.lastChecked).getTime() : 0;
                const healthCheckPassed = await this.performHealthCheck(promoteClient.mobile, lastChecked, now);
                if (!healthCheckPassed)
                    continue;
            }
            const processResult = await this.processClient(promoteClient, client);
            if (processResult.updateCount > 0) {
                totalUpdates += processResult.updateCount;
                updatedEntries.push(`${client.clientId} | ${promoteClient.mobile} | ${processResult.updateSummary || 'updated'} | count=${processResult.updateCount}`);
            }
        }
        const clientNeedingPromoteClients = [];
        for (const client of clients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeedsForCurrentState(client.clientId);
            if (availabilityNeeds.totalNeeded <= 0)
                continue;
            const healthyCount = healthyPromoteClientsPerClient.get(client.clientId) || 0;
            const remainingCapacity = Math.max(0, this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT - healthyCount);
            if (remainingCapacity <= 0) {
                this.logger.debug(`Skipping dynamic promote enrollment for ${client.clientId}: healthy pool already at cap`, {
                    healthyCount,
                    cap: this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT,
                    requested: availabilityNeeds.totalNeeded,
                });
                continue;
            }
            const cappedNeeded = Math.min(availabilityNeeds.totalNeeded, remainingCapacity);
            clientNeedingPromoteClients.push({
                clientId: client.clientId,
                ...availabilityNeeds,
                totalNeeded: cappedNeeded,
                calculationReason: cappedNeeded < availabilityNeeds.totalNeeded
                    ? `${availabilityNeeds.calculationReason}; capped to remaining healthy capacity ${remainingCapacity}/${this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT}`
                    : availabilityNeeds.calculationReason,
            });
        }
        clientNeedingPromoteClients.sort((a, b) => a.priority - b.priority);
        let totalSlotsNeeded = 0;
        for (const clientNeed of clientNeedingPromoteClients) {
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
        if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
            try {
                dynamicCreateResult = await this.addNewUserstoPromoteClientsDynamic([], goodIds, clientNeedingPromoteClients, healthyPromoteClientsPerClient);
            }
            catch (error) {
                const errMsg = (0, parseError_1.parseError)(error, 'addNewUserstoPromoteClientsDynamic').message;
                this.logger.error(`Dynamic promote enrollment failed: ${errMsg}`);
                try {
                    await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`⚠️ Promote Enrollment Failed\n\n${errMsg}`)}`);
                }
                catch { }
            }
        }
        await this.sendPromoteCheckSummaryNotification(totalUpdates, dynamicCreateResult.createdCount, dynamicCreateResult.attemptedCount, updatedEntries, dynamicCreateResult.createdEntries);
    }
    async isMobileEnrolledAnywhere(mobile) {
        const [promoteExists, bufferExists, clientExists] = await Promise.all([
            this.promoteClientModel.findOne({ mobile }, { _id: 1 }).lean().exec(),
            this.bufferClientService.existsByMobile(mobile),
            this.clientService.findAll().then((clients) => clients.some((c) => c.mobile === mobile)),
        ]);
        if (promoteExists)
            return 'promoteClients';
        if (bufferExists)
            return 'bufferClients';
        if (clientExists)
            return 'clients';
        return null;
    }
    async createPromoteClientFromUser(document, targetClientId, availableDate) {
        const enrolledIn = await this.isMobileEnrolledAnywhere(document.mobile);
        if (enrolledIn) {
            this.logger.debug(`Skipping ${document.mobile}: already enrolled in ${enrolledIn}`);
            return false;
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
        try {
            const hasPassword = await telegramClient.hasPassword();
            if (hasPassword) {
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }
            const channels = await (0, channelinfo_1.channelInfo)(telegramClient.client, true);
            await (0, Helpers_1.sleep)(client_helper_utils_1.ClientHelperUtils.gaussianRandom(7500, 1250, 5000, 10000));
            const user = (await this.usersService.search({ mobile: document.mobile }))[0];
            const targetAvailableDate = availableDate || client_helper_utils_1.ClientHelperUtils.getTodayDateString();
            const promoteClient = {
                tgId: document.tgId,
                lastActive: new Date().toISOString(),
                mobile: document.mobile,
                session: user?.session || '',
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Enrolled for warmup',
                lastUsed: null,
            };
            await this.promoteClientModel.findOneAndUpdate({ mobile: document.mobile }, {
                $set: {
                    ...promoteClient,
                    warmupPhase: base_client_service_1.WarmupPhase.ENROLLED,
                    warmupJitter: client_helper_utils_1.ClientHelperUtils.generateWarmupJitter(),
                    enrolledAt: new Date(),
                }
            }, { new: true, upsert: true }).exec();
            this.logger.log(`Created PromoteClient for ${targetClientId} with availability ${targetAvailableDate}`);
            await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, [
                '<b>Promote Client Enrolled</b>',
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
            if ((0, isPermanentError_1.default)(errorDetails)) {
                try {
                    await this.markAsInactive(document.mobile, errorDetails.message);
                }
                catch { }
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
    async addNewUserstoPromoteClients(badIds, goodIds, clientsNeedingPromoteClients = [], promoteClientsPerClient) {
        const clientNeedingDynamic = [];
        for (const clientId of clientsNeedingPromoteClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingDynamic.push({ clientId, ...availabilityNeeds });
            }
        }
        clientNeedingDynamic.sort((a, b) => a.priority - b.priority);
        await this.addNewUserstoPromoteClientsDynamic(badIds, goodIds, clientNeedingDynamic, promoteClientsPerClient);
    }
    async addNewUserstoPromoteClientsDynamic(badIds, goodIds, clientsNeedingPromoteClients, promoteClientsPerClient) {
        const threeMonthsAgo = client_helper_utils_1.ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);
        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingPromoteClients) {
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
        const projectedHealthyCounts = new Map(promoteClientsPerClient || []);
        for (const clientNeed of clientsNeedingPromoteClients) {
            const currentHealthyCount = projectedHealthyCounts.get(clientNeed.clientId) || 0;
            const remainingCapacity = Math.max(0, this.MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT - currentHealthyCount);
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
                const created = await this.createPromoteClientFromUser(document, assignment.clientId, today);
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
        this.logger.log(`Dynamic batch completed: Created ${createdCount} new promote clients (${attemptedCount} attempted)`);
        return { createdCount, attemptedCount, createdEntries };
    }
    async getPromoteClientDistribution() {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);
        const [totalPromoteClients, unassignedPromoteClients, activePromoteClients, inactivePromoteClients, assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts,] = await Promise.all([
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
                status: needed === 0 ? 'sufficient' : 'needs_more',
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
    async getPromoteClientsByStatus(status) {
        return this.promoteClientModel.find({ status }).exec();
    }
    async getPromoteClientsWithMessages() {
        return this.promoteClientModel.find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 }).exec();
    }
    async getLeastRecentlyUsedPromoteClients(clientId, limit = 1) {
        return await this.getLeastRecentlyUsedClients(clientId, limit);
    }
    async getNextAvailablePromoteClient(clientId) {
        const clients = await this.getLeastRecentlyUsedPromoteClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }
    async getUnusedPromoteClients(hoursAgo = 24, clientId) {
        return await this.getUnusedClients(hoursAgo, clientId);
    }
    async sendPromoteCheckSummaryNotification(totalUpdates, createdCount, attemptedCount, updatedEntries, createdEntries) {
        const distribution = await this.getPromoteClientDistribution();
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
            '<b>Promote Client Check Summary</b>',
            '',
            `<b>Active:</b> ${distribution.activePromoteClients}`,
            `<b>Inactive:</b> ${distribution.inactivePromoteClients}`,
            `<b>Unassigned:</b> ${distribution.unassignedPromoteClients}`,
            `<b>Updates Applied:</b> ${totalUpdates}`,
            `<b>Created This Run:</b> ${createdCount}`,
            `<b>Attempted Creates:</b> ${attemptedCount}`,
            `<b>Total Needed:</b> ${distribution.summary.totalPromoteClientsNeeded}`,
            `<b>Clients Needing More:</b> ${distribution.summary.clientsNeedingPromoteClients}`,
            '',
            ...updatedLines,
            ...createdLines,
            '<b>Per Client Summary:</b>',
            ...lines,
        ].join('\n'), { parseMode: 'HTML' });
    }
    removeFromPromoteMap(key) { this.removeFromJoinMap(key); }
    clearPromoteMap() { this.clearJoinMap(); }
};
exports.PromoteClientService = PromoteClientService;
exports.PromoteClientService = PromoteClientService = PromoteClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(promote_client_schema_1.PromoteClient.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => session_manager_1.SessionService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        buffer_client_service_1.BufferClientService,
        session_manager_1.SessionService,
        bots_1.BotsService])
], PromoteClientService);
//# sourceMappingURL=promote-client.service.js.map