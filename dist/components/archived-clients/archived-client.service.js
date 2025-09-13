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
var ArchivedClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchivedClientService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const client_service_1 = require("../clients/client.service");
const utils_1 = require("../../utils");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
let ArchivedClientService = ArchivedClientService_1 = class ArchivedClientService {
    constructor(archivedclientModel, telegramService, clientService) {
        this.archivedclientModel = archivedclientModel;
        this.telegramService = telegramService;
        this.clientService = clientService;
        this.logger = new utils_1.Logger(ArchivedClientService_1.name);
        this.MAX_OLD_SESSIONS = 10;
        this.SESSION_GENERATION_TIMEOUT = 30000;
        this.MAX_RETRY_ATTEMPTS = 3;
        this.SESSION_VALIDATION_CACHE = new Map();
        this.CACHE_EXPIRY = 5 * 60 * 1000;
    }
    async create(createArchivedClientDto) {
        try {
            this.logger.log(`Creating new archived client for mobile: ${createArchivedClientDto.mobile}`);
            const createdUser = new this.archivedclientModel({
                ...createArchivedClientDto,
                createdAt: new Date(),
                sessionHistory: [{
                        session: createArchivedClientDto.session,
                        createdAt: new Date(),
                        status: 'active',
                        source: 'initial_creation'
                    }]
            });
            const result = await createdUser.save();
            this.logger.log(`Successfully created archived client for mobile: ${createArchivedClientDto.mobile}`);
            return result;
        }
        catch (error) {
            this.logger.error(`Failed to create archived client for mobile ${createArchivedClientDto.mobile}:`, error);
            throw new common_1.InternalServerErrorException(`Failed to create archived client: ${error.message}`);
        }
    }
    async findAll() {
        const results = await this.archivedclientModel.find().exec();
        return results;
    }
    async findOne(mobile) {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        return user;
    }
    async fetchOne(mobile) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        this.logger.log(`Session factory request for mobile: ${mobile}`);
        try {
            const archivedClient = await this.findOne(mobile);
            if (archivedClient) {
                this.logger.log(`Found existing archived client for ${mobile}`);
                const isCurrentSessionActive = await this.isSessionActive(mobile, archivedClient.session);
                if (isCurrentSessionActive) {
                    this.logger.log(`Current session for ${mobile} is active, returning existing session`);
                    await this.auditSessionAccess(mobile, archivedClient.session, 'session_reused');
                    return archivedClient;
                }
                this.logger.log(`Current session for ${mobile} is inactive, attempting to find active session from history`);
                const activeSession = await this.findActiveSessionFromHistory(archivedClient);
                if (activeSession) {
                    this.logger.log(`Found active session in history for ${mobile}, promoting it`);
                    return await this.promoteActiveSession(mobile, activeSession, archivedClient);
                }
                this.logger.log(`No active sessions found for ${mobile}, generating new session`);
                return await this.generateAndUpdateSession(mobile, archivedClient);
            }
            else {
                this.logger.log(`New client ${mobile}, creating fresh session`);
                return await this.createNewClientWithSession(mobile);
            }
        }
        catch (error) {
            this.logger.error(`Session factory failed for mobile ${mobile}:`, error);
            throw new common_1.InternalServerErrorException(`Session generation failed: ${(0, utils_1.parseError)(error).message}`);
        }
    }
    async update(mobile, updateClientDto) {
        delete updateClientDto["_id"];
        if (updateClientDto._doc) {
            delete updateClientDto._doc['_id'];
        }
        console.log({ ...updateClientDto });
        const updatedUser = await this.archivedclientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        return updatedUser;
    }
    async remove(mobile) {
        const deletedUser = await this.archivedclientModel.findOneAndDelete({ mobile }).exec();
        if (!deletedUser) {
            throw new common_1.NotFoundException(`Client with ID "${mobile}" not found`);
        }
        return deletedUser;
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
        return this.archivedclientModel.find(filter).exec();
    }
    async checkArchivedClients() {
        console.log('Starting archived clients check...');
        await (0, Helpers_1.sleep)(2000);
        const archivedClients = await this.findAll();
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);
        console.log(`Found ${archivedClients.length} archived clients to check`);
        let processedCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;
        let errorCount = 0;
        for (const document of archivedClients) {
            try {
                processedCount++;
                console.log(`Processing ${processedCount}/${archivedClients.length}: ${document.mobile}`);
                if (!clientIds.includes(document.mobile)) {
                    const sessionCheckResult = await this.checkAndUpdateMainSession(document);
                    if (sessionCheckResult.updated) {
                        updatedCount++;
                        console.log(`Updated session for archived client ${document.mobile}`);
                    }
                    await this.cleanupOldSessions(document.mobile, 3);
                    try {
                        const currentClient = await this.findOne(document.mobile);
                        if (currentClient && currentClient.session) {
                            await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: true, handler: false });
                            await this.telegramService.updateUsername(document.mobile, '');
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                            console.log(`Updated Telegram profile for archived client ${document.mobile}`);
                        }
                    }
                    catch (telegramError) {
                        console.log(`Could not update Telegram profile for ${document.mobile}:`, telegramError.message);
                        if (sessionCheckResult.allSessionsDead) {
                            try {
                                await this.remove(document.mobile);
                                deletedCount++;
                                console.log(`Removed archived client ${document.mobile} - all sessions dead`);
                            }
                            catch (removeError) {
                                console.log(`Could not remove dead archived client ${document.mobile}:`, removeError.message);
                            }
                        }
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                }
                else {
                    console.log(`${document.mobile} is an active client, skipping archived client processing`);
                }
                await (0, Helpers_1.sleep)(1000);
            }
            catch (error) {
                errorCount++;
                console.log(`Error processing archived client ${document.mobile}:`, error.message);
            }
        }
        const summary = {
            total: archivedClients.length,
            processed: processedCount,
            updated: updatedCount,
            deleted: deletedCount,
            errors: errorCount
        };
        console.log('Archived clients check completed:', summary);
        return `Archived clients check completed. Processed: ${processedCount}, Updated: ${updatedCount}, Deleted: ${deletedCount}, Errors: ${errorCount}`;
    }
    async checkAndUpdateMainSession(archivedClient) {
        const mobile = archivedClient.mobile;
        console.log(`Checking main session for ${mobile}...`);
        const isMainSessionActive = await this.isSessionActive(mobile, archivedClient.session);
        if (isMainSessionActive) {
            console.log(`Main session for ${mobile} is active`);
            return { updated: false, allSessionsDead: false };
        }
        console.log(`Main session for ${mobile} is inactive, checking old sessions...`);
        const oldSessions = archivedClient.oldSessions || [];
        if (oldSessions.length === 0) {
            console.log(`No old sessions available for ${mobile}`);
            return { updated: false, allSessionsDead: true };
        }
        for (let i = oldSessions.length - 1; i >= 0; i--) {
            const oldSession = oldSessions[i];
            console.log(`Testing old session ${i + 1}/${oldSessions.length} for ${mobile}...`);
            try {
                const isOldSessionActive = await this.isSessionActive(mobile, oldSession);
                if (isOldSessionActive) {
                    console.log(`Found active old session for ${mobile}, promoting to main session`);
                    const remainingOldSessions = oldSessions.filter((_, index) => index !== i);
                    remainingOldSessions.unshift(archivedClient.session);
                    const trimmedOldSessions = remainingOldSessions.slice(0, this.MAX_OLD_SESSIONS);
                    await this.archivedclientModel.findOneAndUpdate({ mobile }, {
                        $set: {
                            session: oldSession,
                            oldSessions: trimmedOldSessions
                        }
                    }, { new: true }).exec();
                    console.log(`Successfully promoted old session to main session for ${mobile}`);
                    return { updated: true, allSessionsDead: false };
                }
            }
            catch (error) {
                console.log(`Error checking old session for ${mobile}:`, error.message);
            }
        }
        console.log(`No active sessions found for ${mobile}`);
        return { updated: false, allSessionsDead: true };
    }
    async executeQuery(query) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            return await this.archivedclientModel.find(query).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async backupCurrentSession(archivedClient) {
        const currentSession = archivedClient.session;
        const oldSessions = archivedClient.oldSessions || [];
        oldSessions.push(currentSession);
        if (oldSessions.length > this.MAX_OLD_SESSIONS) {
            oldSessions.splice(0, oldSessions.length - this.MAX_OLD_SESSIONS);
        }
        return { oldSessions };
    }
    async isSessionActive(mobile, session) {
        if (!session || session.trim().length === 0) {
            return false;
        }
        const cacheKey = `${mobile}:${session.substring(0, 20)}`;
        const cached = this.SESSION_VALIDATION_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_EXPIRY) {
            this.logger.debug(`Using cached session validation for ${mobile}`);
            return cached.isValid;
        }
        let isActive = false;
        try {
            this.logger.debug(`Validating session for ${mobile}...`);
            this.logger.debug(`Attempting connection validation for ${mobile}`);
            const connectionTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000));
            await Promise.race([
                connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: true, handler: false }),
                connectionTimeout
            ]);
            isActive = true;
            this.logger.debug(`Connection validation successful for ${mobile}`);
        }
        catch (error) {
            isActive = false;
            this.logger.debug(`Session validation failed for ${mobile}: ${error.message}`);
        }
        finally {
            await this.safeCleanupConnection(mobile);
        }
        this.SESSION_VALIDATION_CACHE.set(cacheKey, {
            isValid: isActive,
            timestamp: Date.now()
        });
        if (this.SESSION_VALIDATION_CACHE.size > 1000) {
            this.cleanupValidationCache();
        }
        return isActive;
    }
    cleanupValidationCache() {
        const now = Date.now();
        for (const [key, value] of this.SESSION_VALIDATION_CACHE.entries()) {
            if (now - value.timestamp > this.CACHE_EXPIRY) {
                this.SESSION_VALIDATION_CACHE.delete(key);
            }
        }
        this.logger.debug(`Cleaned up validation cache, remaining entries: ${this.SESSION_VALIDATION_CACHE.size}`);
    }
    async updateSession(mobile, newSession) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        if (!newSession || newSession.trim().length === 0) {
            throw new common_1.BadRequestException('New session token is required and cannot be empty');
        }
        this.logger.log(`Updating session for mobile: ${mobile}`);
        try {
            const archivedClient = await this.findOne(mobile);
            if (!archivedClient) {
                throw new common_1.NotFoundException(`Archived client with mobile "${mobile}" not found`);
            }
            const isNewSessionValid = await this.isSessionActive(mobile, newSession);
            if (!isNewSessionValid) {
                this.logger.warn(`New session provided for ${mobile} is not valid`);
            }
            const updateData = {
                session: newSession,
                lastUpdated: new Date()
            };
            try {
                const isCurrentSessionActive = await this.isSessionActive(mobile, archivedClient.session);
                if (isCurrentSessionActive && archivedClient.session !== newSession) {
                    this.logger.log(`Current session for ${mobile} is active, backing up before update`);
                    const backupData = await this.backupCurrentSession(archivedClient);
                    updateData.oldSessions = backupData.oldSessions;
                    await this.auditSessionAccess(mobile, archivedClient.session, 'session_backed_up_before_update');
                }
                else {
                    this.logger.log(`Current session for ${mobile} is inactive, replacing without backup`);
                }
            }
            catch (error) {
                this.logger.warn(`Could not verify current session status for ${mobile}, proceeding with update:`, error.message);
            }
            const updatedClient = await this.archivedclientModel.findOneAndUpdate({ mobile }, { $set: updateData }, {
                new: true,
                upsert: false,
                runValidators: true
            }).exec();
            if (!updatedClient) {
                throw new common_1.NotFoundException(`Failed to update archived client with mobile "${mobile}"`);
            }
            this.clearCacheForMobile(mobile);
            await this.auditSessionAccess(mobile, newSession, 'session_manually_updated');
            this.logger.log(`Successfully updated session for mobile: ${mobile}`);
            return updatedClient;
        }
        catch (error) {
            this.logger.error(`Failed to update session for mobile ${mobile}:`, error);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException(`Session update failed: ${error.message}`);
        }
    }
    clearCacheForMobile(mobile) {
        const keysToDelete = [];
        for (const key of this.SESSION_VALIDATION_CACHE.keys()) {
            if (key.startsWith(`${mobile}:`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.SESSION_VALIDATION_CACHE.delete(key));
        this.logger.debug(`Cleared ${keysToDelete.length} cache entries for mobile: ${mobile}`);
    }
    async getOldSessions(mobile) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        const archivedClient = await this.findOne(mobile);
        if (!archivedClient) {
            throw new common_1.NotFoundException(`Archived client with mobile "${mobile}" not found`);
        }
        console.log(`Retrieved ${archivedClient.oldSessions?.length || 0} old sessions for ${mobile}`);
        return archivedClient.oldSessions || [];
    }
    async cleanupOldSessions(mobile, maxSessions = 5) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        if (maxSessions < 0 || maxSessions > 20) {
            throw new common_1.BadRequestException('maxSessions must be between 0 and 20');
        }
        this.logger.log(`Starting session cleanup for mobile: ${mobile}, maxSessions: ${maxSessions}`);
        try {
            const archivedClient = await this.findOne(mobile);
            if (!archivedClient) {
                throw new common_1.NotFoundException(`Archived client with mobile "${mobile}" not found`);
            }
            const oldSessions = archivedClient.oldSessions || [];
            if (oldSessions.length === 0) {
                this.logger.log(`No old sessions found for ${mobile}, cleanup not needed`);
                return archivedClient;
            }
            this.logger.log(`Analyzing ${oldSessions.length} old sessions for ${mobile}...`);
            const sessionAnalysis = {
                active: [],
                inactive: [],
                failed: []
            };
            const sessionPromises = oldSessions.map(async (session, index) => {
                try {
                    await (0, Helpers_1.sleep)(100 * index);
                    const isActive = await this.isSessionActive(mobile, session);
                    const sessionId = session.substring(0, 10) + '...';
                    if (isActive) {
                        sessionAnalysis.active.push(session);
                        this.logger.debug(`Session ${sessionId} is active`);
                    }
                    else {
                        sessionAnalysis.inactive.push(session);
                        this.logger.debug(`Session ${sessionId} is inactive`);
                    }
                }
                catch (error) {
                    sessionAnalysis.failed.push(session);
                    this.logger.warn(`Session check failed for ${session.substring(0, 10)}...:`, error.message);
                }
            });
            await Promise.all(sessionPromises);
            let finalActiveSessions = sessionAnalysis.active;
            if (sessionAnalysis.active.length > maxSessions) {
                finalActiveSessions = sessionAnalysis.active.slice(-maxSessions);
                const removedCount = sessionAnalysis.active.length - maxSessions;
                this.logger.log(`Limiting active sessions from ${sessionAnalysis.active.length} to ${maxSessions}, removing ${removedCount} oldest`);
            }
            const totalRemovedCount = sessionAnalysis.inactive.length + sessionAnalysis.failed.length +
                (sessionAnalysis.active.length - finalActiveSessions.length);
            if (totalRemovedCount === 0) {
                this.logger.log(`No cleanup needed for ${mobile}, all ${oldSessions.length} sessions are active and within limit`);
                return archivedClient;
            }
            const updatedClient = await this.archivedclientModel.findOneAndUpdate({ mobile }, {
                $set: {
                    oldSessions: finalActiveSessions,
                    lastCleanup: new Date()
                }
            }, { new: true }).exec();
            await this.auditSessionAccess(mobile, 'cleanup_operation', `removed_${totalRemovedCount}_sessions`);
            const summary = {
                total: oldSessions.length,
                active: sessionAnalysis.active.length,
                inactive: sessionAnalysis.inactive.length,
                failed: sessionAnalysis.failed.length,
                kept: finalActiveSessions.length,
                removed: totalRemovedCount
            };
            this.logger.log(`Session cleanup completed for ${mobile}:`, summary);
            return updatedClient;
        }
        catch (error) {
            this.logger.error(`Session cleanup failed for mobile ${mobile}:`, error);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException(`Session cleanup failed: ${error.message}`);
        }
    }
    async getSessionStatus(mobile) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        this.logger.log(`Getting comprehensive session status for mobile: ${mobile}`);
        try {
            const archivedClient = await this.findOne(mobile);
            if (!archivedClient) {
                throw new common_1.NotFoundException(`Archived client with mobile "${mobile}" not found`);
            }
            const isMainActive = await this.isSessionActive(mobile, archivedClient.session);
            let activeOldSessions = 0;
            if (archivedClient.oldSessions && archivedClient.oldSessions.length > 0) {
                const healthCheckPromises = archivedClient.oldSessions.slice(0, 3).map(async (session) => {
                    try {
                        return await this.isSessionActive(mobile, session);
                    }
                    catch {
                        return false;
                    }
                });
                const results = await Promise.all(healthCheckPromises);
                activeOldSessions = results.filter(Boolean).length;
            }
            let reliability = 'low';
            if (isMainActive && activeOldSessions >= 2) {
                reliability = 'high';
            }
            else if (isMainActive || activeOldSessions >= 1) {
                reliability = 'medium';
            }
            const lastUpdated = archivedClient.lastUpdated || archivedClient.createdAt || new Date();
            const sessionAge = this.calculateSessionAge(lastUpdated);
            const result = {
                mobile,
                isMainSessionActive: isMainActive,
                totalOldSessions: archivedClient.oldSessions?.length || 0,
                lastChecked: new Date().toISOString(),
                healthMetrics: {
                    activeOldSessions,
                    lastUpdated: lastUpdated.toISOString(),
                    sessionAge,
                    reliability
                }
            };
            this.logger.log(`Session status check completed for ${mobile}, reliability: ${reliability}`);
            return result;
        }
        catch (error) {
            this.logger.error(`Failed to get session status for mobile ${mobile}:`, error);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException(`Session status check failed: ${error.message}`);
        }
    }
    calculateSessionAge(lastUpdated) {
        const now = new Date();
        const diffMs = now.getTime() - lastUpdated.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        }
        else if (diffHours > 0) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        }
        else if (diffMins > 0) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        }
        else {
            return 'Just now';
        }
    }
    async batchFetchSessions(mobiles) {
        if (!mobiles || mobiles.length === 0) {
            throw new common_1.BadRequestException('Mobile numbers array is required');
        }
        if (mobiles.length > 50) {
            throw new common_1.BadRequestException('Batch size cannot exceed 50 mobiles');
        }
        this.logger.log(`Batch session factory request for ${mobiles.length} mobiles`);
        const results = await Promise.allSettled(mobiles.map(async (mobile) => {
            try {
                const client = await this.fetchOne(mobile);
                return { mobile, client };
            }
            catch (error) {
                return { mobile, client: null, error: error.message };
            }
        }));
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            else {
                return {
                    mobile: mobiles[index],
                    client: null,
                    error: result.reason?.message || 'Unknown error'
                };
            }
        });
    }
    async createNewClientWithSession(mobile) {
        let attempt = 0;
        let lastError;
        while (attempt < this.MAX_RETRY_ATTEMPTS) {
            try {
                attempt++;
                this.logger.log(`Creating new session for ${mobile}, attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}`);
                const newSession = await Promise.race([
                    this.generateNewSession(mobile),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Session generation timeout')), this.SESSION_GENERATION_TIMEOUT))
                ]);
                const newClient = await this.create({
                    session: newSession,
                    mobile: mobile,
                    oldSessions: []
                });
                await this.auditSessionAccess(mobile, newSession, 'new_client_created');
                this.logger.log(`Successfully created new client with session for ${mobile}`);
                return newClient;
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`Attempt ${attempt} failed for new client ${mobile}:`, error.message);
                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    await (0, Helpers_1.sleep)(1000 * attempt);
                }
            }
            finally {
                await this.safeCleanupConnection(mobile);
            }
        }
        throw new common_1.InternalServerErrorException(`Failed to create new client after ${this.MAX_RETRY_ATTEMPTS} attempts: ${lastError.message}`);
    }
    async generateAndUpdateSession(mobile, existingClient) {
        let attempt = 0;
        let lastError;
        while (attempt < this.MAX_RETRY_ATTEMPTS) {
            try {
                attempt++;
                this.logger.log(`Generating new session for existing client ${mobile}, attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}`);
                const newSession = await Promise.race([
                    this.generateNewSession(mobile),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Session generation timeout')), this.SESSION_GENERATION_TIMEOUT))
                ]);
                await this.backupSessionToHistory(mobile, existingClient.session, 'session_replaced');
                const updatedClient = await this.archivedclientModel.findOneAndUpdate({ mobile }, {
                    $set: {
                        session: newSession,
                        lastUpdated: new Date()
                    },
                    $push: {
                        oldSessions: {
                            $each: [existingClient.session],
                            $slice: -this.MAX_OLD_SESSIONS
                        }
                    }
                }, { new: true }).exec();
                await this.auditSessionAccess(mobile, newSession, 'new_session_generated');
                this.logger.log(`Successfully generated new session for ${mobile}`);
                return updatedClient;
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`Attempt ${attempt} failed for session generation ${mobile}:`, error.message);
                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    await (0, Helpers_1.sleep)(1000 * attempt);
                }
            }
            finally {
                await this.safeCleanupConnection(mobile);
            }
        }
        throw new common_1.InternalServerErrorException(`Failed to generate session after ${this.MAX_RETRY_ATTEMPTS} attempts: ${lastError.message}`);
    }
    async findActiveSessionFromHistory(archivedClient) {
        const oldSessions = archivedClient.oldSessions || [];
        if (oldSessions.length === 0) {
            return null;
        }
        for (let i = oldSessions.length - 1; i >= 0; i--) {
            const session = oldSessions[i];
            try {
                this.logger.log(`Checking session ${i + 1}/${oldSessions.length} for ${archivedClient.mobile}`);
                const isActive = await this.isSessionActive(archivedClient.mobile, session);
                if (isActive) {
                    this.logger.log(`Found active session in history for ${archivedClient.mobile}`);
                    return session;
                }
            }
            catch (error) {
                this.logger.warn(`Failed to check session ${i + 1} for ${archivedClient.mobile}:`, error.message);
            }
        }
        return null;
    }
    async promoteActiveSession(mobile, activeSession, archivedClient) {
        try {
            const updatedOldSessions = (archivedClient.oldSessions || []).filter(s => s !== activeSession);
            if (archivedClient.session !== activeSession) {
                updatedOldSessions.unshift(archivedClient.session);
            }
            const trimmedOldSessions = updatedOldSessions.slice(0, this.MAX_OLD_SESSIONS);
            const updatedClient = await this.archivedclientModel.findOneAndUpdate({ mobile }, {
                $set: {
                    session: activeSession,
                    oldSessions: trimmedOldSessions,
                    lastUpdated: new Date()
                }
            }, { new: true }).exec();
            await this.auditSessionAccess(mobile, activeSession, 'session_promoted_from_history');
            this.logger.log(`Successfully promoted session from history for ${mobile}`);
            return updatedClient;
        }
        catch (error) {
            this.logger.error(`Failed to promote session for ${mobile}:`, error);
            throw new common_1.InternalServerErrorException(`Failed to promote session: ${error.message}`);
        }
    }
    async generateNewSession(mobile) {
        try {
            await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: true, handler: false });
            const newSession = await this.telegramService.createNewSession(mobile);
            if (!newSession || newSession.trim().length === 0) {
                throw new Error('Generated session is empty or invalid');
            }
            return newSession;
        }
        catch (error) {
            this.logger.error(`Session generation failed for ${mobile}:`, error);
            throw error;
        }
    }
    async auditSessionAccess(mobile, session, action) {
        try {
            await this.archivedclientModel.findOneAndUpdate({ mobile }, {
                $push: {
                    sessionHistory: {
                        $each: [{
                                session: session.substring(0, 20) + '...',
                                action,
                                timestamp: new Date(),
                                status: 'active'
                            }],
                        $slice: -50
                    }
                }
            }, { upsert: false }).exec();
        }
        catch (error) {
            this.logger.warn(`Failed to audit session access for ${mobile}:`, error.message);
        }
    }
    async backupSessionToHistory(mobile, session, reason) {
        try {
            await this.auditSessionAccess(mobile, session, `backup_${reason}`);
        }
        catch (error) {
            this.logger.warn(`Failed to backup session to history for ${mobile}:`, error.message);
        }
    }
    async safeCleanupConnection(mobile) {
        try {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
        catch (error) {
            this.logger.warn(`Failed to cleanup connection for ${mobile}:`, error.message);
        }
    }
    getCacheStatistics() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;
        for (const [, value] of this.SESSION_VALIDATION_CACHE.entries()) {
            if (now - value.timestamp < this.CACHE_EXPIRY) {
                validEntries++;
            }
            else {
                expiredEntries++;
            }
        }
        const totalEntries = this.SESSION_VALIDATION_CACHE.size;
        const cacheHitRate = totalEntries > 0 ?
            Math.round((validEntries / totalEntries) * 100) + '%' : '0%';
        return {
            totalEntries,
            validEntries,
            expiredEntries,
            cacheHitRate,
            lastCleanup: new Date().toISOString()
        };
    }
};
exports.ArchivedClientService = ArchivedClientService;
exports.ArchivedClientService = ArchivedClientService = ArchivedClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('ArchivedClient')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        client_service_1.ClientService])
], ArchivedClientService);
//# sourceMappingURL=archived-client.service.js.map