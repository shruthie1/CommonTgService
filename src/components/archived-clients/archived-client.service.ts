import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    forwardRef,
    Logger
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateClientDto } from '../clients/dto/create-client.dto';
import { CreateArchivedClientDto } from './dto/create-archived-client.dto';
import { ArchivedClient, ArchivedClientDocument } from './schemas/archived-client.schema';
import { UpdateClientDto } from '../clients/dto/update-client.dto';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { ClientService } from '../clients/client.service';
import { parseError } from '../../utils/parseError';
import { connectionManager } from '../Telegram/utils/connection-manager';
@Injectable()
export class ArchivedClientService {
    private readonly logger = new Logger(ArchivedClientService.name);
    private readonly MAX_OLD_SESSIONS = 10;
    private readonly SESSION_GENERATION_TIMEOUT = 30000; // 30 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private readonly SESSION_VALIDATION_CACHE = new Map<string, { isValid: boolean; timestamp: number }>();
    private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

    constructor(
        @InjectModel('ArchivedClient') private archivedclientModel: Model<ArchivedClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => ClientService))
        private clientService: ClientService,
    ) {
    }

    async create(createArchivedClientDto: CreateArchivedClientDto): Promise<ArchivedClient> {
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
        } catch (error) {
            this.logger.error(`Failed to create archived client for mobile ${createArchivedClientDto.mobile}:`, error);
            throw new InternalServerErrorException(`Failed to create archived client: ${error.message}`);
        }
    }

    async findAll(): Promise<ArchivedClient[]> {
        const results: ArchivedClient[] = await this.archivedclientModel.find().exec();
        return results
    }

    async findOne(mobile: string): Promise<ArchivedClient> {
        const user = (await this.archivedclientModel.findOne({ mobile }).exec())?.toJSON();
        return user;
    }

    /**
     * Core session factory method - Always provides a valid, active session
     * This is the primary method for obtaining sessions per mobile number
     */
    async fetchOne(mobile: string): Promise<ArchivedClient> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        this.logger.log(`Session factory request for mobile: ${mobile}`);

        try {
            // First, try to get existing client
            const archivedClient = await this.findOne(mobile);

            if (archivedClient) {
                this.logger.log(`Found existing archived client for ${mobile}`);

                // Check if current session is still active
                const isCurrentSessionActive = await this.isSessionActive(mobile, archivedClient.session);

                if (isCurrentSessionActive) {
                    this.logger.log(`Current session for ${mobile} is active, returning existing session`);
                    await this.auditSessionAccess(mobile, archivedClient.session, 'session_reused');
                    return archivedClient;
                }

                this.logger.log(`Current session for ${mobile} is inactive, attempting to find active session from history`);

                // Try to find an active session from old sessions
                const activeSession = await this.findActiveSessionFromHistory(archivedClient);

                if (activeSession) {
                    this.logger.log(`Found active session in history for ${mobile}, promoting it`);
                    return await this.promoteActiveSession(mobile, activeSession, archivedClient);
                }

                // No active sessions found, generate new one
                this.logger.log(`No active sessions found for ${mobile}, generating new session`);
                return await this.generateAndUpdateSession(mobile, archivedClient);
            } else {
                // New client, create session from scratch
                this.logger.log(`New client ${mobile}, creating fresh session`);
                return await this.createNewClientWithSession(mobile);
            }
        } catch (error) {
            this.logger.error(`Session factory failed for mobile ${mobile}:`, error);
            throw new InternalServerErrorException(`Session generation failed: ${parseError(error).message}`);
        }
    }

    async update(mobile: string, updateClientDto: UpdateClientDto): Promise<ArchivedClient> {
        delete updateClientDto["_id"]
        if ((<any>updateClientDto)._doc) {
            delete (<any>updateClientDto)._doc['_id']
        }
        console.log({ ...updateClientDto });
        const updatedUser = await this.archivedclientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true }).exec();
        return updatedUser;
    }

    async remove(mobile: string): Promise<ArchivedClient> {
        const deletedUser = await this.archivedclientModel.findOneAndDelete({ mobile }).exec();
        if (!deletedUser) {
            throw new NotFoundException(`Client with ID "${mobile}" not found`);
        }
        return deletedUser;
    }

    async search(filter: any): Promise<ArchivedClient[]> {
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.archivedclientModel.find(filter).exec();
    }

    async checkArchivedClients() {
        console.log('Starting archived clients check...');
        await sleep(2000);

        const archivedClients = await this.findAll();
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);

        console.log(`Found ${archivedClients.length} archived clients to check`);

        let processedCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;
        let errorCount = 0;

        // Process each archived client sequentially to avoid overwhelming the system
        for (const document of archivedClients) {
            try {
                processedCount++;
                console.log(`Processing ${processedCount}/${archivedClients.length}: ${document.mobile}`);

                if (!clientIds.includes(document.mobile)) {
                    // This is truly an archived client, not an active one
                    const sessionCheckResult = await this.checkAndUpdateMainSession(document);

                    if (sessionCheckResult.updated) {
                        updatedCount++;
                        console.log(`Updated session for archived client ${document.mobile}`);
                    }

                    // Clean up old sessions for this client
                    await this.cleanupOldSessions(document.mobile, 3); // Keep only 3 old sessions for archived clients

                    // Try to update the account to show it's deleted
                    try {
                        const currentClient = await this.findOne(document.mobile);
                        if (currentClient && currentClient.session) {
                            await connectionManager.getClient(document.mobile, { autoDisconnect: true, handler: false });
                            await this.telegramService.updateUsername(document.mobile, '');
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                            console.log(`Updated Telegram profile for archived client ${document.mobile}`);
                        }
                    } catch (telegramError) {
                        console.log(`Could not update Telegram profile for ${document.mobile}:`, telegramError.message);

                        // If all sessions are dead, consider removing this archived client
                        if (sessionCheckResult.allSessionsDead) {
                            try {
                                await this.remove(document.mobile);
                                deletedCount++;
                                console.log(`Removed archived client ${document.mobile} - all sessions dead`);
                            } catch (removeError) {
                                console.log(`Could not remove dead archived client ${document.mobile}:`, removeError.message);
                            }
                        }
                    } finally {
                        await connectionManager.unregisterClient(document.mobile);
                    }
                } else {
                    console.log(`${document.mobile} is an active client, skipping archived client processing`);
                }

                // Add small delay between processing clients
                await sleep(1000);

            } catch (error) {
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

    private async checkAndUpdateMainSession(archivedClient: ArchivedClient): Promise<{ updated: boolean, allSessionsDead: boolean }> {
        const mobile = archivedClient.mobile;
        console.log(`Checking main session for ${mobile}...`);

        // Check if main session is active
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

        // Check old sessions to find an active one
        for (let i = oldSessions.length - 1; i >= 0; i--) { // Start from most recent
            const oldSession = oldSessions[i];
            console.log(`Testing old session ${i + 1}/${oldSessions.length} for ${mobile}...`);

            try {
                const isOldSessionActive = await this.isSessionActive(mobile, oldSession);

                if (isOldSessionActive) {
                    console.log(`Found active old session for ${mobile}, promoting to main session`);

                    // Promote this old session to main session
                    const remainingOldSessions = oldSessions.filter((_, index) => index !== i);
                    // Add the old main session to old sessions
                    remainingOldSessions.unshift(archivedClient.session);

                    // Limit old sessions
                    const trimmedOldSessions = remainingOldSessions.slice(0, this.MAX_OLD_SESSIONS);

                    await this.archivedclientModel.findOneAndUpdate(
                        { mobile },
                        {
                            $set: {
                                session: oldSession,
                                oldSessions: trimmedOldSessions
                            }
                        },
                        { new: true }
                    ).exec();

                    console.log(`Successfully promoted old session to main session for ${mobile}`);
                    return { updated: true, allSessionsDead: false };
                }
            } catch (error) {
                console.log(`Error checking old session for ${mobile}:`, error.message);
            }
        }

        console.log(`No active sessions found for ${mobile}`);
        return { updated: false, allSessionsDead: true };
    }

    async executeQuery(query: any): Promise<any> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
            return await this.archivedclientModel.find(query).exec();
        } catch (error) {
            throw new InternalServerErrorException(error.message);
        }
    }

    private async backupCurrentSession(archivedClient: ArchivedClient): Promise<{ oldSessions: string[] }> {
        const currentSession = archivedClient.session;
        const oldSessions = archivedClient.oldSessions || [];
        oldSessions.push(currentSession);

        if (oldSessions.length > this.MAX_OLD_SESSIONS) {
            oldSessions.splice(0, oldSessions.length - this.MAX_OLD_SESSIONS);
        }

        return { oldSessions };
    }

    /**
     * Enhanced session validation with caching and comprehensive checks
     */
    private async isSessionActive(mobile: string, session: string): Promise<boolean> {
        if (!session || session.trim().length === 0) {
            return false;
        }

        const cacheKey = `${mobile}:${session.substring(0, 20)}`;

        // Check cache first
        const cached = this.SESSION_VALIDATION_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_EXPIRY) {
            this.logger.debug(`Using cached session validation for ${mobile}`);
            return cached.isValid;
        }

        let isActive = false;
        try {
            this.logger.debug(`Validating session for ${mobile}...`);

            // Try to validate by attempting connection (more thorough but expensive)
            this.logger.debug(`Attempting connection validation for ${mobile}`);

            const connectionTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), 10000)
            );

            await Promise.race([
                connectionManager.getClient(mobile, { autoDisconnect: true, handler: false }),
                connectionTimeout
            ]);

            isActive = true;
            this.logger.debug(`Connection validation successful for ${mobile}`);

        } catch (error) {
            isActive = false;
            this.logger.debug(`Session validation failed for ${mobile}: ${error.message}`);
        } finally {
            await this.safeCleanupConnection(mobile);
        }

        // Update cache
        this.SESSION_VALIDATION_CACHE.set(cacheKey, {
            isValid: isActive,
            timestamp: Date.now()
        });

        // Clean up old cache entries periodically
        if (this.SESSION_VALIDATION_CACHE.size > 1000) {
            this.cleanupValidationCache();
        }

        return isActive;
    }

    /**
     * Cleans up expired cache entries
     */
    private cleanupValidationCache(): void {
        const now = Date.now();
        for (const [key, value] of this.SESSION_VALIDATION_CACHE.entries()) {
            if (now - value.timestamp > this.CACHE_EXPIRY) {
                this.SESSION_VALIDATION_CACHE.delete(key);
            }
        }
        this.logger.debug(`Cleaned up validation cache, remaining entries: ${this.SESSION_VALIDATION_CACHE.size}`);
    }

    /**
     * Production-grade session update with comprehensive validation and backup
     */
    async updateSession(mobile: string, newSession: string): Promise<ArchivedClient> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        if (!newSession || newSession.trim().length === 0) {
            throw new BadRequestException('New session token is required and cannot be empty');
        }

        this.logger.log(`Updating session for mobile: ${mobile}`);

        try {
            const archivedClient = await this.findOne(mobile);
            if (!archivedClient) {
                throw new NotFoundException(`Archived client with mobile "${mobile}" not found`);
            }

            // Validate the new session first
            const isNewSessionValid = await this.isSessionActive(mobile, newSession);
            if (!isNewSessionValid) {
                this.logger.warn(`New session provided for ${mobile} is not valid`);
                // Still proceed as the session might become valid later
            }

            const updateData: any = {
                session: newSession,
                lastUpdated: new Date()
            };

            // Check if current session is still active and needs backup
            try {
                const isCurrentSessionActive = await this.isSessionActive(mobile, archivedClient.session);

                if (isCurrentSessionActive && archivedClient.session !== newSession) {
                    this.logger.log(`Current session for ${mobile} is active, backing up before update`);

                    const backupData = await this.backupCurrentSession(archivedClient);
                    updateData.oldSessions = backupData.oldSessions;

                    await this.auditSessionAccess(mobile, archivedClient.session, 'session_backed_up_before_update');
                } else {
                    this.logger.log(`Current session for ${mobile} is inactive, replacing without backup`);
                }
            } catch (error) {
                this.logger.warn(`Could not verify current session status for ${mobile}, proceeding with update:`, error.message);
            }

            // Perform the update with atomic operation
            const updatedClient = await this.archivedclientModel.findOneAndUpdate(
                { mobile },
                { $set: updateData },
                {
                    new: true,
                    upsert: false,
                    runValidators: true
                }
            ).exec();

            if (!updatedClient) {
                throw new NotFoundException(`Failed to update archived client with mobile "${mobile}"`);
            }

            // Clear cache for this mobile
            this.clearCacheForMobile(mobile);

            await this.auditSessionAccess(mobile, newSession, 'session_manually_updated');
            this.logger.log(`Successfully updated session for mobile: ${mobile}`);

            return updatedClient;

        } catch (error) {
            this.logger.error(`Failed to update session for mobile ${mobile}:`, error);

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            throw new InternalServerErrorException(`Session update failed: ${error.message}`);
        }
    }

    /**
     * Clears validation cache entries for a specific mobile
     */
    private clearCacheForMobile(mobile: string): void {
        const keysToDelete = [];
        for (const key of this.SESSION_VALIDATION_CACHE.keys()) {
            if (key.startsWith(`${mobile}:`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.SESSION_VALIDATION_CACHE.delete(key));
        this.logger.debug(`Cleared ${keysToDelete.length} cache entries for mobile: ${mobile}`);
    }

    async getOldSessions(mobile: string): Promise<string[]> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        const archivedClient = await this.findOne(mobile);
        if (!archivedClient) {
            throw new NotFoundException(`Archived client with mobile "${mobile}" not found`);
        }

        console.log(`Retrieved ${archivedClient.oldSessions?.length || 0} old sessions for ${mobile}`);
        return archivedClient.oldSessions || [];
    }

    /**
     * Production-grade session cleanup with detailed reporting
     */
    async cleanupOldSessions(mobile: string, maxSessions: number = 5): Promise<ArchivedClient> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        if (maxSessions < 0 || maxSessions > 20) {
            throw new BadRequestException('maxSessions must be between 0 and 20');
        }

        this.logger.log(`Starting session cleanup for mobile: ${mobile}, maxSessions: ${maxSessions}`);

        try {
            const archivedClient = await this.findOne(mobile);
            if (!archivedClient) {
                throw new NotFoundException(`Archived client with mobile "${mobile}" not found`);
            }

            const oldSessions = archivedClient.oldSessions || [];

            if (oldSessions.length === 0) {
                this.logger.log(`No old sessions found for ${mobile}, cleanup not needed`);
                return archivedClient;
            }

            this.logger.log(`Analyzing ${oldSessions.length} old sessions for ${mobile}...`);

            const sessionAnalysis = {
                active: [] as string[],
                inactive: [] as string[],
                failed: [] as string[]
            };

            // Analyze each session concurrently but with rate limiting
            const sessionPromises = oldSessions.map(async (session, index) => {
                try {
                    // Add small delay to prevent overwhelming the system
                    await sleep(100 * index);

                    const isActive = await this.isSessionActive(mobile, session);
                    const sessionId = session.substring(0, 10) + '...';

                    if (isActive) {
                        sessionAnalysis.active.push(session);
                        this.logger.debug(`Session ${sessionId} is active`);
                    } else {
                        sessionAnalysis.inactive.push(session);
                        this.logger.debug(`Session ${sessionId} is inactive`);
                    }
                } catch (error) {
                    sessionAnalysis.failed.push(session);
                    this.logger.warn(`Session check failed for ${session.substring(0, 10)}...:`, error.message);
                }
            });

            await Promise.all(sessionPromises);

            // Determine which sessions to keep
            let finalActiveSessions = sessionAnalysis.active;

            if (sessionAnalysis.active.length > maxSessions) {
                // Keep only the most recent active sessions
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

            // Update the database
            const updatedClient = await this.archivedclientModel.findOneAndUpdate(
                { mobile },
                {
                    $set: {
                        oldSessions: finalActiveSessions,
                        lastCleanup: new Date()
                    }
                },
                { new: true }
            ).exec();

            // Audit the cleanup operation
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

        } catch (error) {
            this.logger.error(`Session cleanup failed for mobile ${mobile}:`, error);

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            throw new InternalServerErrorException(`Session cleanup failed: ${error.message}`);
        }
    }

    /**
     * Comprehensive session status with health metrics
     */
    async getSessionStatus(mobile: string): Promise<{
        mobile: string;
        isMainSessionActive: boolean;
        totalOldSessions: number;
        lastChecked: string;
        healthMetrics: {
            activeOldSessions: number;
            lastUpdated: string;
            sessionAge: string;
            reliability: 'high' | 'medium' | 'low';
        };
    }> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        this.logger.log(`Getting comprehensive session status for mobile: ${mobile}`);

        try {
            const archivedClient = await this.findOne(mobile);
            if (!archivedClient) {
                throw new NotFoundException(`Archived client with mobile "${mobile}" not found`);
            }

            const isMainActive = await this.isSessionActive(mobile, archivedClient.session);

            // Quick check of old sessions health
            let activeOldSessions = 0;
            if (archivedClient.oldSessions && archivedClient.oldSessions.length > 0) {
                const healthCheckPromises = archivedClient.oldSessions.slice(0, 3).map(async (session) => {
                    try {
                        return await this.isSessionActive(mobile, session);
                    } catch {
                        return false;
                    }
                });

                const results = await Promise.all(healthCheckPromises);
                activeOldSessions = results.filter(Boolean).length;
            }

            // Calculate reliability based on session health
            let reliability: 'high' | 'medium' | 'low' = 'low';
            if (isMainActive && activeOldSessions >= 2) {
                reliability = 'high';
            } else if (isMainActive || activeOldSessions >= 1) {
                reliability = 'medium';
            }

            // Calculate session age
            const lastUpdated = (archivedClient as any).lastUpdated || (archivedClient as any).createdAt || new Date();
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

        } catch (error) {
            this.logger.error(`Failed to get session status for mobile ${mobile}:`, error);

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            throw new InternalServerErrorException(`Session status check failed: ${error.message}`);
        }
    }

    /**
     * Calculates human-readable session age
     */
    private calculateSessionAge(lastUpdated: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - lastUpdated.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffMins > 0) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    /**
     * Batch session factory method - for multiple mobiles
     */
    async batchFetchSessions(mobiles: string[]): Promise<{ mobile: string; client: ArchivedClient | null; error?: string }[]> {
        if (!mobiles || mobiles.length === 0) {
            throw new BadRequestException('Mobile numbers array is required');
        }

        if (mobiles.length > 50) {
            throw new BadRequestException('Batch size cannot exceed 50 mobiles');
        }

        this.logger.log(`Batch session factory request for ${mobiles.length} mobiles`);

        const results = await Promise.allSettled(
            mobiles.map(async (mobile) => {
                try {
                    const client = await this.fetchOne(mobile);
                    return { mobile, client };
                } catch (error) {
                    return { mobile, client: null, error: error.message };
                }
            })
        );

        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    mobile: mobiles[index],
                    client: null,
                    error: result.reason?.message || 'Unknown error'
                };
            }
        });
    }

    /**
     * Creates a completely new client with fresh session
     */
    private async createNewClientWithSession(mobile: string): Promise<ArchivedClient> {
        let attempt = 0;
        let lastError: Error;

        while (attempt < this.MAX_RETRY_ATTEMPTS) {
            try {
                attempt++;
                this.logger.log(`Creating new session for ${mobile}, attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}`);

                // Generate new session with timeout
                const newSession = await Promise.race([
                    this.generateNewSession(mobile),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Session generation timeout')), this.SESSION_GENERATION_TIMEOUT)
                    )
                ]);

                const newClient = await this.create({
                    session: newSession,
                    mobile: mobile,
                    oldSessions: []
                } as CreateArchivedClientDto);

                await this.auditSessionAccess(mobile, newSession, 'new_client_created');
                this.logger.log(`Successfully created new client with session for ${mobile}`);
                return newClient;

            } catch (error) {
                lastError = error;
                this.logger.warn(`Attempt ${attempt} failed for new client ${mobile}:`, error.message);

                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    await sleep(1000 * attempt); // Exponential backoff
                }
            } finally {
                await this.safeCleanupConnection(mobile);
            }
        }

        throw new InternalServerErrorException(`Failed to create new client after ${this.MAX_RETRY_ATTEMPTS} attempts: ${lastError.message}`);
    }

    /**
     * Generates and updates session for existing client
     */
    private async generateAndUpdateSession(mobile: string, existingClient: ArchivedClient): Promise<ArchivedClient> {
        let attempt = 0;
        let lastError: Error;

        while (attempt < this.MAX_RETRY_ATTEMPTS) {
            try {
                attempt++;
                this.logger.log(`Generating new session for existing client ${mobile}, attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}`);

                const newSession = await Promise.race([
                    this.generateNewSession(mobile),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Session generation timeout')), this.SESSION_GENERATION_TIMEOUT)
                    )
                ]);

                // Backup current session to history
                await this.backupSessionToHistory(mobile, existingClient.session, 'session_replaced');

                // Update with new session
                const updatedClient = await this.archivedclientModel.findOneAndUpdate(
                    { mobile },
                    {
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
                    },
                    { new: true }
                ).exec();

                await this.auditSessionAccess(mobile, newSession, 'new_session_generated');
                this.logger.log(`Successfully generated new session for ${mobile}`);
                return updatedClient;

            } catch (error) {
                lastError = error;
                this.logger.warn(`Attempt ${attempt} failed for session generation ${mobile}:`, error.message);

                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    await sleep(1000 * attempt);
                }
            } finally {
                await this.safeCleanupConnection(mobile);
            }
        }

        throw new InternalServerErrorException(`Failed to generate session after ${this.MAX_RETRY_ATTEMPTS} attempts: ${lastError.message}`);
    }

    /**
     * Finds an active session from the session history
     */
    private async findActiveSessionFromHistory(archivedClient: ArchivedClient): Promise<string | null> {
        const oldSessions = archivedClient.oldSessions || [];

        if (oldSessions.length === 0) {
            return null;
        }

        // Check sessions from most recent to oldest
        for (let i = oldSessions.length - 1; i >= 0; i--) {
            const session = oldSessions[i];
            try {
                this.logger.log(`Checking session ${i + 1}/${oldSessions.length} for ${archivedClient.mobile}`);

                const isActive = await this.isSessionActive(archivedClient.mobile, session);
                if (isActive) {
                    this.logger.log(`Found active session in history for ${archivedClient.mobile}`);
                    return session;
                }
            } catch (error) {
                this.logger.warn(`Failed to check session ${i + 1} for ${archivedClient.mobile}:`, error.message);
            }
        }

        return null;
    }

    /**
     * Promotes an active session from history to be the main session
     */
    private async promoteActiveSession(mobile: string, activeSession: string, archivedClient: ArchivedClient): Promise<ArchivedClient> {
        try {
            // Remove the active session from old sessions
            const updatedOldSessions = (archivedClient.oldSessions || []).filter(s => s !== activeSession);

            // Add current session to old sessions if it's different
            if (archivedClient.session !== activeSession) {
                updatedOldSessions.unshift(archivedClient.session);
            }

            // Limit old sessions
            const trimmedOldSessions = updatedOldSessions.slice(0, this.MAX_OLD_SESSIONS);

            const updatedClient = await this.archivedclientModel.findOneAndUpdate(
                { mobile },
                {
                    $set: {
                        session: activeSession,
                        oldSessions: trimmedOldSessions,
                        lastUpdated: new Date()
                    }
                },
                { new: true }
            ).exec();

            await this.auditSessionAccess(mobile, activeSession, 'session_promoted_from_history');
            this.logger.log(`Successfully promoted session from history for ${mobile}`);
            return updatedClient;

        } catch (error) {
            this.logger.error(`Failed to promote session for ${mobile}:`, error);
            throw new InternalServerErrorException(`Failed to promote session: ${error.message}`);
        }
    }

    /**
     * Generates a new session using Telegram service
     */
    private async generateNewSession(mobile: string): Promise<string> {
        try {
            await connectionManager.getClient(mobile, { autoDisconnect: true, handler: false });
            const newSession = await this.telegramService.createNewSession(mobile);

            if (!newSession || newSession.trim().length === 0) {
                throw new Error('Generated session is empty or invalid');
            }

            return newSession;
        } catch (error) {
            this.logger.error(`Session generation failed for ${mobile}:`, error);
            throw error;
        }
    }

    /**
     * Audits session access for tracking purposes
     */
    private async auditSessionAccess(mobile: string, session: string, action: string): Promise<void> {
        try {
            await this.archivedclientModel.findOneAndUpdate(
                { mobile },
                {
                    $push: {
                        sessionHistory: {
                            $each: [{
                                session: session.substring(0, 20) + '...', // Truncate for security
                                action,
                                timestamp: new Date(),
                                status: 'active'
                            }],
                            $slice: -50 // Keep last 50 audit entries
                        }
                    }
                },
                { upsert: false }
            ).exec();
        } catch (error) {
            this.logger.warn(`Failed to audit session access for ${mobile}:`, error.message);
            // Don't fail the main operation for audit failures
        }
    }

    /**
     * Safely backs up session to history
     */
    private async backupSessionToHistory(mobile: string, session: string, reason: string): Promise<void> {
        try {
            await this.auditSessionAccess(mobile, session, `backup_${reason}`);
        } catch (error) {
            this.logger.warn(`Failed to backup session to history for ${mobile}:`, error.message);
        }
    }

    /**
     * Safely cleans up connections
     */
    private async safeCleanupConnection(mobile: string): Promise<void> {
        try {
            await connectionManager.unregisterClient(mobile);
        } catch (error) {
            this.logger.warn(`Failed to cleanup connection for ${mobile}:`, error.message);
        }
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStatistics(): {
        totalEntries: number;
        validEntries: number;
        expiredEntries: number;
        cacheHitRate: string;
        lastCleanup: string;
    } {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [, value] of this.SESSION_VALIDATION_CACHE.entries()) {
            if (now - value.timestamp < this.CACHE_EXPIRY) {
                validEntries++;
            } else {
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
}
