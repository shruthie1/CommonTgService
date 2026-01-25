import { ChannelsService } from './../channels/channels.service';
import { Channel } from './../channels/schemas/channel.schema';
import {
    BadRequestException,
    ConflictException,
    HttpException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    forwardRef,
    OnModuleDestroy,
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
import { getCuteEmoji, Logger, obfuscateText } from '../../utils';
import { ActiveChannel } from '../active-channels';
import { SearchBufferClientDto } from './dto/search-buffer-client.dto';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import TelegramManager from '../Telegram/TelegramManager';
import { Client } from '../clients';
import path from 'path';
import { CloudinaryService } from '../../cloudinary';
import { Api } from 'telegram';
import isPermanentError from '../../utils/isPermanentError';
import { isIncludedWithTolerance, safeAttemptReverse } from '../../utils/checkMe.utils';
import { BotsService, ChannelCategory } from '../bots';
import { ClientHelperUtils } from '../shared/client-helper.utils';

@Injectable()
export class BufferClientService implements OnModuleDestroy {
    private readonly logger = new Logger(BufferClientService.name);
    private joinChannelMap: Map<string, Channel[] | ActiveChannel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout | null = null;
    private leaveChannelMap: Map<string, string[]> = new Map();
    private leaveChannelIntervalId: NodeJS.Timeout | null = null;
    private isJoinChannelProcessing: boolean = false;
    private isLeaveChannelProcessing: boolean = false;

    // Track all timeouts for proper cleanup
    private activeTimeouts: Set<NodeJS.Timeout> = new Set();

    // Fixed constant values to match comments
    private readonly JOIN_CHANNEL_INTERVAL = 6 * 60 * 1000; // Increased to 6 minutes
    private readonly LEAVE_CHANNEL_INTERVAL = 120 * 1000; // Increased to 120 seconds
    private readonly LEAVE_CHANNEL_BATCH_SIZE = 10;
    private readonly CLIENT_PROCESSING_DELAY = 10000; // Increased to 10 seconds between clients
    private readonly CHANNEL_PROCESSING_DELAY = 20000; // Increased to 20 seconds between channel operations

    // Memory management constants
    private readonly MAX_MAP_SIZE = 100; // Prevent unbounded Map growth
    private readonly CLEANUP_INTERVAL = 15 * 60 * 1000; // Increased to 15 minutes

    // Per-client buffer client management constants
    private readonly MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER = 10; // Rate limiting constant
    private readonly MIN_TOTAL_BUFFER_CLIENTS = 10; // Minimum total buffer clients per client (even if windows satisfied)

    // Dynamic availability windows configuration
    // Each window defines minimum required buffer clients available by that date
    private readonly AVAILABILITY_WINDOWS = [
        { name: 'today', days: 0, minRequired: 3 },
        { name: 'tomorrow', days: 1, minRequired: 5 },
        { name: 'oneWeek', days: 7, minRequired: 7 },
        { name: 'tenDays', days: 10, minRequired: 9 }
    ];

    // Date/time constants
    private readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;
    private readonly THREE_MONTHS_MS = 3 * 30 * this.ONE_DAY_MS;
    private readonly INACTIVE_USER_CUTOFF_DAYS = 90; // 3 months

    private cleanupIntervalId: NodeJS.Timeout | null = null;

    constructor(
        @InjectModel('bufferClientModule')
        private bufferClientModel: Model<BufferClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ClientService))
        private clientService: ClientService,
        @Inject(forwardRef(() => ChannelsService))
        private channelsService: ChannelsService,
        @Inject(forwardRef(() => PromoteClientService))
        private promoteClientService: PromoteClientService,
        @Inject(forwardRef(() => SessionService))
        private sessionService: SessionService,
        private botsService: BotsService,
    ) { }

    async onModuleDestroy() {
        await this.cleanup();
    }

    private async cleanup(): Promise<void> {
        try {
            // Clear all timeouts
            this.clearAllTimeouts();

            // Clear intervals
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            this.clearMemoryCleanup();

            // Clear maps
            this.clearBufferMap();
            this.clearLeaveMap();

            // Reset processing flags
            this.isJoinChannelProcessing = false;
            this.isLeaveChannelProcessing = false;
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }

    private startMemoryCleanup(): void {
        this.cleanupIntervalId = setInterval(() => {
            this.performMemoryCleanup();
        }, this.CLEANUP_INTERVAL);

        this.activeTimeouts.add(this.cleanupIntervalId);
    }

    private clearMemoryCleanup(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.activeTimeouts.delete(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }
    }

    private performMemoryCleanup(): void {
        try {
            // Clean up empty entries in joinChannelMap
            for (const [mobile, channels] of this.joinChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    this.logger.log(`Cleaning up joinChannelMap entry for mobile: ${mobile} as channels : ${channels}`,);
                    this.joinChannelMap.delete(mobile);
                }
            }

            // Clean up empty entries in leaveChannelMap
            for (const [mobile, channels] of this.leaveChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    this.logger.log(`Cleaning up leaveChannelMap entry for mobile: ${mobile} as channels : ${channels}`);
                    this.leaveChannelMap.delete(mobile);
                }
            }

            // Prevent Map growth beyond reasonable limits
            if (this.joinChannelMap.size > this.MAX_MAP_SIZE) {
                const keysToRemove = Array.from(this.joinChannelMap.keys()).slice(
                    this.MAX_MAP_SIZE,
                );
                keysToRemove.forEach((key) => this.joinChannelMap.delete(key));
                this.logger.warn(
                    `Cleaned up ${keysToRemove.length} entries from joinChannelMap to prevent memory leak`,
                );
            }

            if (this.leaveChannelMap.size > this.MAX_MAP_SIZE) {
                const keysToRemove = Array.from(this.leaveChannelMap.keys()).slice(
                    this.MAX_MAP_SIZE,
                );
                keysToRemove.forEach((key) => this.leaveChannelMap.delete(key));
                this.logger.warn(
                    `Cleaned up ${keysToRemove.length} entries from leaveChannelMap to prevent memory leak`,
                );
            }

            this.logger.debug(
                `Map Memory Check completed. Maps sizes - Join: ${this.joinChannelMap.size}, Leave: ${this.leaveChannelMap.size}, Active timeouts: ${this.activeTimeouts.size}`,
            );
        } catch (error) {
            this.logger.error('Error during memory cleanup:', error);
        }
    }

    private createTimeout(callback: () => void, delay: number): NodeJS.Timeout {
        const timeout = setTimeout(() => {
            this.activeTimeouts.delete(timeout);
            callback();
        }, delay);
        this.activeTimeouts.add(timeout);
        return timeout;
    }

    private clearAllTimeouts(): void {
        this.activeTimeouts.forEach((timeout) => {
            clearTimeout(timeout);
        });
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }

    /**
     * Safely unregister a Telegram client connection
     * Handles errors and logs appropriately
     */
    private async safeUnregisterClient(mobile: string): Promise<void> {
        try {
            await connectionManager.unregisterClient(mobile);
        } catch (unregisterError: unknown) {
            const errorMessage = unregisterError instanceof Error ? unregisterError.message : 'Unknown error';
            this.logger.error(`Error unregistering client ${mobile}: ${errorMessage}`);
        }
    }

    /**
     * Helper method for consistent error handling
     * Parses errors and returns standardized error details
     */
    private handleError(error: unknown, context: string, mobile?: string): ReturnType<typeof parseError> {
        const contextWithMobile = mobile ? `${context}: ${mobile}` : context;
        return parseError(error, contextWithMobile, false);
    }

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClientDocument> {
        // Ensure status is set to 'active' by default if not provided
        const result = await this.bufferClientModel.create({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
        this.logger.log(`Buffer Client Created:\n\nMobile: ${bufferClient.mobile}`);
        this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client Created:\n\nMobile: ${bufferClient.mobile}`);
        return result;
    }

    async findAll(status?: 'active' | 'inactive'): Promise<BufferClientDocument[]> {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }

    async findOne(
        mobile: string,
        throwErr: boolean = true,
    ): Promise<BufferClientDocument> {
        const bufferClient = (
            await this.bufferClientModel.findOne({ mobile }).exec()
        )?.toJSON();
        if (!bufferClient && throwErr) {
            throw new NotFoundException(
                `BufferClient with mobile ${mobile} not found`,
            );
        }
        return bufferClient;
    }

    async update(
        mobile: string,
        updateClientDto: UpdateBufferClientDto,
    ): Promise<BufferClientDocument> {
        // Update existing document only (no upsert to prevent accidental creation)
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate(
                { mobile },
                { $set: updateClientDto },
                { new: true, returnDocument: 'after' },
            )
            .exec();

        if (!updatedBufferClient) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }

        return updatedBufferClient;
    }

    async createOrUpdate(
        mobile: string,
        createorUpdateBufferClientDto: CreateBufferClientDto | UpdateBufferClientDto,
    ): Promise<BufferClientDocument> {
        const existingBufferClient = (
            await this.bufferClientModel.findOne({ mobile }).exec()
        )?.toJSON();
        if (existingBufferClient) {
            this.logger.log('Updating existing Client');
            return this.update(
                existingBufferClient.mobile,
                createorUpdateBufferClientDto as UpdateBufferClientDto,
            );
        } else {
            this.logger.log('creating new Client');
            // Ensure status is set to 'active' by default if not provided
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
                throw new NotFoundException(
                    `BufferClient with mobile ${mobile} not found`,
                );
            }
            this.logger.log(`Removing BufferClient with mobile: ${mobile}`);
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}\n${message}`)}`);
            await this.bufferClientModel.deleteOne({ mobile }).exec();
        } catch (error) {
            const errorDetails = parseError(error, `failed to delete BufferClient: ${mobile}`);
            this.logger.error(
                `Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`,
            );
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }
    async search(filter: SearchBufferClientDto): Promise<BufferClientDocument[]> {
        if (filter.tgId === "refresh") {
            // Fire-and-forget: update sessions in background
            this.updateAllClientSessions().catch((error) => {
                this.logger.error('Error updating all client sessions:', error);
            });
            return [];
        }
        return await this.bufferClientModel.find(filter).exec();
    }

    async executeQuery(
        query: Record<string, any>,
        sort?: Record<string, any>,
        limit?: number,
        skip?: number,
    ): Promise<BufferClientDocument[]> {
        if (!query) {
            throw new BadRequestException('Query is invalid.');
        }

        try {
            const queryExec = this.bufferClientModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }

            if (limit) {
                queryExec.limit(limit);
            }

            if (skip) {
                queryExec.skip(skip);
            }

            return await queryExec.exec();
        } catch (error) {
            // Re-throw known exceptions, wrap unknown errors
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new InternalServerErrorException(`Query execution failed: ${errorMessage}`);
        }
    }

    removeFromBufferMap(key: string) {
        this.joinChannelMap.delete(key);
    }

    private safeSetJoinChannelMap(mobile: string, channels: Channel[] | ActiveChannel[]): boolean {
        if (
            this.joinChannelMap.size >= this.MAX_MAP_SIZE &&
            !this.joinChannelMap.has(mobile)
        ) {
            this.logger.warn(
                `Join channel map size limit reached (${this.MAX_MAP_SIZE}), cannot add ${mobile}`,
            );
            return false;
        }
        this.joinChannelMap.set(mobile, channels);
        return true;
    }

    private safeSetLeaveChannelMap(mobile: string, channels: string[]): boolean {
        if (
            this.leaveChannelMap.size >= this.MAX_MAP_SIZE &&
            !this.leaveChannelMap.has(mobile)
        ) {
            this.logger.warn(
                `Leave channel map size limit reached (${this.MAX_MAP_SIZE}), cannot add ${mobile}`,
            );
            return false;
        }
        this.leaveChannelMap.set(mobile, channels);
        return true;
    }

    clearBufferMap() {
        const mapSize = this.joinChannelMap.size;
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
        this.logger.debug(`BufferMap cleared, removed ${mapSize} entries`);
    }

    async updateStatus(
        mobile: string,
        status: 'active' | 'inactive',
        message?: string,
    ): Promise<BufferClientDocument> {
        const updateData: UpdateBufferClientDto = { status };
        if (message) {
            updateData.message = message;
        }
        await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return await this.update(mobile, updateData);
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

    async updateInfo() {
        const clients = await this.bufferClientModel
            .find({
                status: 'active',
                lastChecked: { $lt: new Date(Date.now() - 7 * this.ONE_DAY_MS) }
            })
            .sort({ channels: 1 })
            .limit(25);

        this.logger.debug(`Updating info for ${clients.length} buffer clients`);

        const now = Date.now();
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client.mobile;

            this.logger.info(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);

            const lastChecked = client.lastChecked
                ? new Date(client.lastChecked).getTime()
                : 0;
            await this.performHealthCheck(mobile, lastChecked, now);

            // Add delay between client processing to avoid rate limits
            if (i < clients.length - 1) {
                await sleep(12000 + Math.random() * 8000); // Increased to 12-20 seconds between each client
            }
        }

        this.logger.debug('Completed updating info for all buffer clients');
    }

    /**
     * Join channels for buffer clients to build account credibility
     * Processes buffer clients sequentially, joining channels and leaving restricted ones
     * @param skipExisting - Whether to skip clients already in the join queue
     * @param clientId - Optional client ID to filter buffer clients
     * @returns Status message indicating how many clients were queued for join/leave operations
     */
    async joinchannelForBufferClients(
        skipExisting: boolean = true,
        clientId?: string,
    ): Promise<string> {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return 'Active client setup exists, skipping buffer promotion';
        }

        this.logger.log('Starting join channel process for buffer clients');

        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
        await sleep(6000 + Math.random() * 3000); // Increased initial sleep

        const existingKeys = skipExisting
            ? []
            : Array.from(this.joinChannelMap.keys());

        // Build query with optional clientId filter
        const query: Record<string, any> = {
            channels: { $lt: 350 },
            mobile: { $nin: existingKeys },
            status: 'active',
        };

        if (clientId) {
            query.clientId = clientId;
        }

        const clients = await this.bufferClientModel
            .find(query)
            .sort({ channels: 1 })
            .limit(8); // Reduced limit for better performance

        this.logger.debug(`Found ${clients.length} buffer clients to process`);

        const joinSet = new Set<string>();
        const leaveSet = new Set<string>();

        let successCount = 0;
        let failCount = 0;

        // Sequential processing with proper delays
        for (let i = 0; i < clients.length; i++) {
            const document = clients[i];
            const mobile = document.mobile;
            this.logger.debug(`Processing buffer client ${i + 1}/${clients.length}: ${mobile}`);

            try {
                const client = await connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });

                const channels = await channelInfo(client.client, true);
                this.logger.debug(
                    `Client ${mobile} has ${channels.ids.length} existing channels`,
                );
                await this.update(mobile, { channels: channels.ids.length });

                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result =
                        channels.ids.length < 220
                            ? await this.activeChannelsService.getActiveChannels(150, 0, excludedIds)
                            : await this.channelsService.getActiveChannels(150, 0, excludedIds);
                    if (!this.joinChannelMap.has(mobile)) {
                        if (this.safeSetJoinChannelMap(mobile, result)) {
                            joinSet.add(mobile);
                            this.logger.debug(`Added ${result.length} channels to join queue for ${mobile}`);
                        } else {
                            this.logger.warn(`Failed to add ${mobile} to join queue due to memory limits`);
                        }
                    } else {
                        this.logger.debug(`${mobile}: Already present in join map, skipping`);
                    }
                    await this.sessionService.getOldestSessionOrCreate({
                        mobile: document.mobile
                    })
                } else {
                    if (!this.leaveChannelMap.has(mobile)) {
                        if (
                            this.safeSetLeaveChannelMap(mobile, channels.canSendFalseChats)
                        ) {
                            leaveSet.add(mobile);
                            this.logger.warn(`Client ${mobile} has ${channels.canSendFalseChats.length} restricted channels, added to leave queue`);
                        } else {
                            this.logger.warn(`Failed to add ${mobile} to leave queue due to memory limits`);
                        }
                    } else {
                        this.logger.debug(`${mobile}: Already present in leave map, skipping`);
                    }
                }

                successCount++;
            } catch (error) {
                failCount++;
                const errorDetails = parseError(error, `JoinChannelErr: ${mobile}`);
                const errorMsg = errorDetails?.message || error?.errorMessage || 'Unknown error';
                if (isPermanentError(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                } else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorMsg}`);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                // Progressive delay between clients to prevent CPU spikes
                if (i < clients.length - 1) {
                    await sleep(this.CLIENT_PROCESSING_DELAY + Math.random() * 5000);
                }
            }
        }

        // Add delay before starting queues
        await sleep(6000 + Math.random() * 3000);

        if (joinSet.size > 0) {
            this.startMemoryCleanup();
            this.logger.debug(`Starting join queue for ${joinSet.size} buffer clients`);
            this.createTimeout(() => this.joinChannelQueue(), 4000 + Math.random() * 2000); // Delayed start
        }

        if (leaveSet.size > 0) {
            this.logger.debug(`Starting leave queue for ${leaveSet.size} buffer clients`);
            this.createTimeout(() => this.leaveChannelQueue(), 10000 + Math.random() * 5000); // Delayed start
        }

        this.logger.log(`Join process complete — Success: ${successCount}, Fail: ${failCount}`);
        return `Buffer Join queued for: ${joinSet.size}, Leave queued for: ${leaveSet.size}`;
    }

    async joinChannelQueue() {
        this.logger.debug('Attempting to start join channel queue');
        if (this.isJoinChannelProcessing) {
            this.logger.warn('Join channel process is already running');
            return;
        }

        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }

        // Start interval if not already running
        if (!this.joinChannelIntervalId) {
            this.logger.debug('Starting join channel interval');
            this.joinChannelIntervalId = setInterval(async () => {
                await this.processJoinChannelInterval();
            }, this.JOIN_CHANNEL_INTERVAL);
            this.activeTimeouts.add(this.joinChannelIntervalId);
            // Schedule first execution after a short delay to avoid race condition
            this.createTimeout(() => this.processJoinChannelInterval(), 1000);
        } else {
            this.logger.warn('Join channel interval is already running');
        }
    }

    private async processJoinChannelInterval() {
        if (this.isJoinChannelProcessing) {
            this.logger.debug('Join channel process already running, skipping interval');
            return;
        }

        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, clearing interval');
            this.clearJoinChannelInterval();
            return;
        }

        this.isJoinChannelProcessing = true;

        try {
            await this.processJoinChannelSequentially();
        } catch (error) {
            this.logger.error('Error in join channel queue', error);
        } finally {
            this.isJoinChannelProcessing = false;

            // Clear interval if no more items to process
            if (this.joinChannelMap.size === 0) {
                this.logger.debug('No more channels to join, clearing interval');
                this.clearJoinChannelInterval();
            }
        }
    }

    private async processJoinChannelSequentially() {
        const keys = Array.from(this.joinChannelMap.keys());
        this.logger.debug(`Processing join channel queue sequentially for ${keys.length} clients`);

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel: Channel | ActiveChannel | null = null;

            try {
                const channels = this.joinChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    continue;
                }

                currentChannel = channels.shift();
                if (!currentChannel) {
                    this.logger.debug(`No channel to process for ${mobile}, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    continue;
                }
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing:`, `@${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                const activeChannel: ActiveChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                if (activeChannel && activeChannel.banned === true) { // add DeletedCount  condition also if required
                    this.logger.debug(`Skipping Channel ${activeChannel.channelId} as it is banned`);
                    // Still add delay even when skipping to maintain rate limiting
                    await sleep(5000 + Math.random() * 3000);
                    continue;
                } else {
                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                }
            } catch (error: unknown) {
                const errorDetails = this.handleError(
                    error,
                    `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error`,
                    mobile,
                );
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Error joining channel for ${mobile}: ${errorMessage}`);

                const errorObj = error as { errorMessage?: string };
                if (
                    errorDetails.error === 'FloodWaitError' ||
                    errorObj.errorMessage === 'CHANNELS_TOO_MUCH'
                ) {
                    this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                    this.removeFromBufferMap(mobile);

                    try {
                        await sleep(10000 + Math.random() * 5000); // Increased delay on FloodWaitError

                        if (errorObj.errorMessage === 'CHANNELS_TOO_MUCH') {
                            await this.update(mobile, { channels: 400 });
                        } else {
                            const channelsInfo = await this.telegramService.getChannelInfo(
                                mobile,
                                true,
                            );
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                    } catch (updateError) {
                        this.logger.error(`Error updating channel count for ${mobile}:`, updateError);
                    }
                }

                if (isPermanentError(errorDetails)) {
                    this.removeFromBufferMap(mobile);
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                // Add delay between channel processing operations
                if (i < keys.length - 1 || this.joinChannelMap.get(mobile)?.length > 0) {
                    await sleep(this.CHANNEL_PROCESSING_DELAY + Math.random() * 10000);
                } else {
                    this.logger.log(`Not Sleeping before continuing with next Mobile`);
                }
            }
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.activeTimeouts.delete(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
        this.isJoinChannelProcessing = false;
    }

    removeFromLeaveMap(key: string) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }

    clearLeaveMap() {
        const mapSize = this.leaveChannelMap.size;
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
        this.logger.debug(`LeaveMap cleared, removed ${mapSize} entries`);
    }

    async leaveChannelQueue() {
        this.logger.debug('Attempting to start leave channel queue');
        if (this.isLeaveChannelProcessing) {
            this.logger.warn('Leave channel process is already running');
            return;
        }

        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }

        // Start interval if not already running
        if (!this.leaveChannelIntervalId) {
            this.logger.debug('Starting leave channel interval');
            this.leaveChannelIntervalId = setInterval(async () => {
                await this.processLeaveChannelInterval();
            }, this.LEAVE_CHANNEL_INTERVAL);
            this.activeTimeouts.add(this.leaveChannelIntervalId);
            // Schedule first execution after a short delay to avoid race condition
            this.createTimeout(() => this.processLeaveChannelInterval(), 1000);
        } else {
            this.logger.debug('Leave channel interval is already running');
        }
    }

    private async processLeaveChannelInterval() {
        if (this.isLeaveChannelProcessing) {
            this.logger.debug('Leave channel process already running, skipping interval');
            return;
        }

        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, clearing interval');
            this.clearLeaveChannelInterval();
            return;
        }

        this.isLeaveChannelProcessing = true;

        try {
            await this.processLeaveChannelSequentially();
        } catch (error) {
            this.logger.error('Error in leave channel queue', error);
        } finally {
            this.isLeaveChannelProcessing = false;

            // Clear interval if no more items to process
            if (this.leaveChannelMap.size === 0) {
                this.logger.debug('No more channels to leave, clearing interval');
                this.clearLeaveChannelInterval();
            }
        }
    }

    private async processLeaveChannelSequentially() {
        const keys = Array.from(this.leaveChannelMap.keys());
        this.logger.debug(`Processing leave channel queue sequentially for ${keys.length} clients`);

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];

            try {
                const channels = this.leaveChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(`No more channels to leave for ${mobile}, removing from queue`);
                    this.removeFromLeaveMap(mobile);
                    continue;
                }

                const channelsToProcess = channels.splice(
                    0,
                    this.LEAVE_CHANNEL_BATCH_SIZE,
                );
                this.logger.debug(`${mobile} has ${channels.length} pending channels to leave, processing ${channelsToProcess.length} channels`);

                // Only update map if there are remaining channels
                if (channels.length > 0) {
                    this.leaveChannelMap.set(mobile, channels);
                } else {
                    this.removeFromLeaveMap(mobile);
                }
                const client = await connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });

                this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);
                await client.leaveChannels(channelsToProcess);
                this.logger.debug(`${mobile} left ${channelsToProcess.length} channels successfully`);
            } catch (error: unknown) {
                const errorDetails = this.handleError(
                    error,
                    `${mobile} Leave Channel Error`,
                    mobile,
                );

                if (isPermanentError(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                    this.removeFromLeaveMap(mobile);
                } else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorDetails.message}`);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                // Add delay between leave operations
                if (
                    i < keys.length - 1 ||
                    this.leaveChannelMap.get(mobile)?.length > 0
                ) {
                    await sleep((this.LEAVE_CHANNEL_INTERVAL / 2) + Math.random() * 60000); // Half the interval as delay with randomness
                }
            }
        }
    }

    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval: ${this.leaveChannelIntervalId}`);
            clearInterval(this.leaveChannelIntervalId);
            this.activeTimeouts.delete(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug('Leave channel interval cleared and processing flag reset');
    }
    async setAsBufferClient(
        mobile: string,
        clientId: string,
        availableDate: string = ClientHelperUtils.getTodayDateString()
    ) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);

        // Check if mobile is already an active client
        if (clientMobiles.includes(mobile)) {
            throw new BadRequestException('Number is an Active Client');
        }

        // If we reach here, buffer client doesn't exist (checked above) and mobile is not an active client
        const telegramClient = await connectionManager.getClient(mobile, {
            autoDisconnect: false
        });
        try {
            await telegramClient.set2fa();
            await sleep(30000 + Math.random() * 30000); // 30-60s delay for 2FA setup
            const channels = await this.telegramService.getChannelInfo(mobile, true);
            await sleep(5000 + Math.random() * 5000); // Delay before session creation
            const newSession = await this.telegramService.createNewSession(user.mobile);
            const bufferClient: CreateBufferClientDto = {
                tgId: user.tgId,
                session: newSession,
                mobile: user.mobile,
                availableDate,
                channels: channels.ids.length,
                clientId,
                status: 'active',
                message: 'Manually configured as buffer client',
                lastUsed: null,
            };
            await this.bufferClientModel
                .findOneAndUpdate({ mobile: user.mobile }, { $set: bufferClient }, { new: true, upsert: true })
                .exec();
        } catch (error) {
            const errorDetails = parseError(error, `Failed to set as Buffer Client ${mobile}`);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        await this.safeUnregisterClient(mobile);
        return 'Client set as buffer successfully';
    }

    async checkBufferClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return;
        }
        const clients = await this.clientService.findAll();
        const promoteClients = await this.promoteClientService.findAll();

        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferMobiles = await this.bufferClientModel
            .find({ clientId: { $exists: true }, status: 'active' })
            .distinct('mobile');

        const goodIds = [
            ...clientMainMobiles,
            ...promoteClients.map((c) => c.mobile),
            ...assignedBufferMobiles,
        ].filter(Boolean);

        const bufferClientsPerClient = new Map<string, number>();

        const bufferClientCounts: { _id: string, count: number, mobiles: string[] }[] = await this.bufferClientModel.aggregate([
            {
                $match: {
                    clientId: { $exists: true, $ne: null },
                    status: 'active',
                },
            },
            {
                $group: {
                    _id: '$clientId',
                    count: { $sum: 1 },
                    mobiles: { $push: '$mobile' },
                },
            },
        ]);
        let totalUpdates = 0;
        const MIN_COOLDOWN_HOURS = 2; // Match processBufferClient cooldown
        const MAX_UPDATES_PER_CYCLE = 5; // Increased to prevent starvation
        const now = Date.now();
        this.logger.debug(`Checking buffer clients, good IDs count: ${goodIds.length}`)

        // Collect all buffer clients with their metadata for priority sorting
        const bufferClientsToProcess: Array<{
            bufferClient: BufferClientDocument;
            client: Client;
            clientId: string;
            priority: number;
        }> = [];

        for (const result of bufferClientCounts) {
            bufferClientsPerClient.set(result._id, result.count);
            const client = clients.find((c) => c.clientId === result._id);
            if (!client) {
                this.logger.warn(`Client with ID ${result._id} not found, skipping buffer clients`);
                continue;
            }
            for (const bufferClientMobile of result.mobiles) {
                const bufferClient = await this.findOne(bufferClientMobile, false);
                if (!bufferClient) {
                    this.logger.warn(`Buffer client ${bufferClientMobile} not found, skipping`);
                    continue;
                }

                // Check if in use
                if (bufferClient.inUse === true) {
                    this.logger.debug(`Skipping ${bufferClientMobile} - currently in use`);
                    continue;
                }

                // Health check: verify client is still alive (check every 7 days)
                const lastChecked = bufferClient.lastChecked
                    ? new Date(bufferClient.lastChecked).getTime()
                    : 0;
                const healthCheckPassed = await this.performHealthCheck(bufferClientMobile, lastChecked, now);
                this.logger.debug(`${bufferClientMobile} health check ${healthCheckPassed ? 'PASSED' : 'FAILED'}`);
                if (!healthCheckPassed) {
                    this.logger.debug(`${bufferClientMobile} has permanent error, continueing with next buffer client!`);
                    continue; // Skip to next client if health check failed permanently
                }

                // Skip clients that have been used (updates were done manually)
                // But backfill their timestamps for record keeping
                if (bufferClient.lastUsed) {
                    const lastUsed = ClientHelperUtils.getTimestamp(bufferClient.lastUsed);
                    if (lastUsed > 0) {
                        // Backfill timestamps for used clients
                        await this.backfillTimestamps(bufferClientMobile, bufferClient, now);
                        this.logger.debug(`Skipping ${bufferClientMobile} - already used, trying timestamps backfill`);
                        continue;
                    }
                }

                // Check cooldown before processing
                const lastUpdateAttempt = bufferClient.lastUpdateAttempt
                    ? new Date(bufferClient.lastUpdateAttempt).getTime()
                    : 0;
                if (lastUpdateAttempt && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                    const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                    this.logger.debug(`Skipping ${bufferClientMobile} - on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                    continue;
                }

                // Calculate priority for sorting
                const pendingUpdates = this.getPendingUpdates(bufferClient, now);
                const accountAge = bufferClient.createdAt ? now - new Date(bufferClient.createdAt).getTime() : 0;
                const DAY = this.ONE_DAY_MS;
                const failedAttempts = bufferClient.failedUpdateAttempts || 0;

                // Priority calculation:
                // 1. More pending updates = higher priority (multiply by 10000 for highest weight)
                // 2. Older lastUpdateAttempt = higher priority (stuck clients) - use hours since last attempt
                // 3. Fewer failed attempts = higher priority (subtract penalty)
                // 4. Never attempted clients get maximum priority boost
                const lastAttemptAgeHours = lastUpdateAttempt > 0
                    ? (now - lastUpdateAttempt) / (60 * 60 * 1000) // Hours since last attempt
                    : 10000; // Never attempted = very high priority

                const priority =
                    (pendingUpdates.totalPending * 10000) + // Most important: pending updates
                    lastAttemptAgeHours + // Older attempts = higher priority
                    (accountAge / DAY) - // Older accounts slightly higher priority
                    (failedAttempts * 100); // Fewer failures = higher priority

                bufferClientsToProcess.push({
                    bufferClient,
                    client,
                    clientId: result._id,
                    priority
                });
            }
        }

        // Sort by priority (highest first)
        bufferClientsToProcess.sort((a, b) => b.priority - a.priority);

        this.logger.debug(`Processing ${bufferClientsToProcess.length} buffer clients in priority order`);

        // Process in priority order
        for (const { bufferClient, client, clientId } of bufferClientsToProcess) {
            if (totalUpdates >= MAX_UPDATES_PER_CYCLE) {
                this.logger.warn(`Reached total update limit of ${MAX_UPDATES_PER_CYCLE} for this check cycle`);
                break;
            }

            const currentUpdates = await this.processBufferClient(bufferClient, client);
            this.logger.debug(`Processed buffer client ${bufferClient.mobile} for client ${clientId}, current updates: ${currentUpdates} | total updates: ${totalUpdates + currentUpdates}`);
            if (currentUpdates > 0) {
                totalUpdates += currentUpdates;
            }
        }

        // NEW: Calculate availability-based needs for each client (dynamic, no hard limit)
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
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(client.clientId);

            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingBufferClients.push({
                    clientId: client.clientId,
                    ...availabilityNeeds
                });
            }
        }

        // Sort by priority (most urgent first: today=0, tomorrow=1, oneWeek=7, tenDays=10, countOnly=100)
        clientNeedingBufferClients.sort((a, b) => a.priority - b.priority);

        // Calculate total slots needed (rate-limited per trigger, but no per-client limit)
        let totalSlotsNeeded = 0;
        const clientNeedsMap = new Map<string, number>();

        for (const clientNeed of clientNeedingBufferClients) {
            // No per-client limit check - only global rate limit per trigger
            const allocated = Math.min(
                clientNeed.totalNeeded,
                this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER - totalSlotsNeeded
            );
            if (allocated > 0) {
                clientNeedsMap.set(clientNeed.clientId, allocated);
                totalSlotsNeeded += allocated;
            }
            if (totalSlotsNeeded >= this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER) break;
        }

        // Enhanced logging to show availability status
        this.logger.debug(`Availability-based needs calculated (NO HARD LIMIT):`);
        clientNeedingBufferClients.forEach(need => {
            this.logger.debug(
                `Client ${need.clientId} (priority: ${need.priority}): ` +
                `${need.totalActive} total active, ${need.totalNeeded} new needed - ${need.calculationReason}`
            );
            need.windowNeeds.forEach(window => {
                if (window.needed > 0) {
                    this.logger.debug(
                        `  - ${window.window} (${window.targetDate}): ` +
                        `${window.available} available, ${window.needed} needed ` +
                        `(target: ${window.minRequired} per window)`
                    );
                } else {
                    this.logger.debug(
                        `  - ${window.window} (${window.targetDate}): ` +
                        `${window.available} available ✅ (sufficient, target: ${window.minRequired})`
                    );
                }
            });
        });

        const totalActiveBufferClients = await this.bufferClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active buffer clients: ${totalActiveBufferClients}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER} per trigger)`);

        // Build notification message
        const clientNeedsSummary = clientNeedingBufferClients
            .map(c => `${c.clientId}: ${c.totalNeeded} (${c.calculationReason})`)
            .join('\n');

        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Buffer Client Check (Dynamic Availability):\n\nTotal Active Buffer Clients: ${totalActiveBufferClients}\nBuffer Clients Per Client: ${JSON.stringify(Object.fromEntries(bufferClientsPerClient))}\n\nClients Needing Buffer Clients:\n${clientNeedsSummary || 'None'}\n\nTotal Slots Needed: ${totalSlotsNeeded}`)}`);

        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoBufferClientsDynamic(
                [],
                goodIds,
                clientNeedingBufferClients,
                bufferClientsPerClient
            );
        } else {
            this.logger.debug('No new buffer clients needed - all availability windows and total count satisfied');
        }
    }

    /**
     * Helper to safely get timestamp from date field
     */

    /**
     * Helper method to update user 2FA status
     * Handles errors gracefully with consistent logging
     */
    private async updateUser2FAStatus(tgId: string, mobile: string): Promise<void> {
        try {
            await this.usersService.update(tgId, { twoFA: true });
        } catch (userUpdateError) {
            this.logger.warn(`Failed to update user 2FA status for ${mobile}:`, userUpdateError);
        }
    }

    /**
     * Calculate availability-based buffer client needs for a specific client
     * Checks availability across multiple time windows (today, tomorrow, 1 week, 10 days)
     * Returns how many new buffer clients are needed to maintain minimum availability
     * 
     * Key: availableDate means "available from" - client is available on/after that date
     * Includes inUse clients in availability count (they're still available, just currently in use)
     * 
     * @param clientId - Client ID to calculate needs for
     * @returns Object with total needed, window details, and calculation reason
     */
    private async calculateAvailabilityBasedNeeds(
        clientId: string
    ): Promise<{
        totalNeeded: number;
        windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
        totalActive: number;
        totalNeededForCount: number;
        calculationReason: string;
        priority: number;
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const windows = this.AVAILABILITY_WINDOWS.map(window => ({
            ...window,
            targetDate: new Date(today.getTime() + window.days * this.ONE_DAY_MS)
                .toISOString().split('T')[0]
        }));

        // Get total active count (includes inUse clients)
        const totalActive = await this.bufferClientModel.countDocuments({
            clientId,
            status: 'active'
        });

        const windowNeeds = [];
        let maxNeeded = 0;
        let mostUrgentWindow = '';
        let mostUrgentPriority = 999;

        for (const window of windows) {
            // Count how many buffer clients are available on or before this window's date
            // Key: availableDate <= targetDate means available on/after that date
            // Include inUse clients (they're still available, just currently in use)
            const availableCount = await this.bufferClientModel.countDocuments({
                clientId,
                status: 'active',
                // NOTE: NOT excluding inUse - they count as available
                availableDate: { $lte: window.targetDate } // Available on/after this date
            });

            const needed = Math.max(0, window.minRequired - availableCount);

            windowNeeds.push({
                window: window.name,
                available: availableCount,
                needed,
                targetDate: window.targetDate,
                minRequired: window.minRequired
            });

            // Track which window needs the most and is most urgent
            if (needed > maxNeeded) {
                maxNeeded = needed;
                mostUrgentWindow = window.name;
                mostUrgentPriority = window.days;
            } else if (needed > 0 && window.days < mostUrgentPriority) {
                // If same need level, prioritize more urgent window
                mostUrgentWindow = window.name;
                mostUrgentPriority = window.days;
            }
        }

        // Check total count requirement
        const totalNeededForCount = Math.max(0, this.MIN_TOTAL_BUFFER_CLIENTS - totalActive);

        // Calculate total needed: max of window needs OR total count needs
        const totalNeeded = Math.max(maxNeeded, totalNeededForCount);

        // Calculate priority: most urgent window that needs clients, or 100 if only count needed
        let priority = 100; // Default: low priority (only count needed)
        if (maxNeeded > 0) {
            priority = mostUrgentPriority; // Use days of most urgent window (0=today, 1=tomorrow, etc.)
        }

        // Build calculation reason for logging
        let calculationReason = '';
        if (maxNeeded > 0 && totalNeededForCount > 0) {
            calculationReason = `Window '${mostUrgentWindow}' needs ${maxNeeded}, total count needs ${totalNeededForCount}`;
        } else if (maxNeeded > 0) {
            const windowConfig = this.AVAILABILITY_WINDOWS.find(w => w.name === mostUrgentWindow);
            calculationReason = `Window '${mostUrgentWindow}' needs ${maxNeeded} to meet minimum of ${windowConfig?.minRequired || 'unknown'}`;
        } else if (totalNeededForCount > 0) {
            calculationReason = `Total count needs ${totalNeededForCount} to reach minimum of ${this.MIN_TOTAL_BUFFER_CLIENTS}`;
        } else {
            calculationReason = 'All windows satisfied';
        }

        return {
            totalNeeded,
            windowNeeds,
            totalActive,
            totalNeededForCount,
            calculationReason,
            priority
        };
    }

    /**
     * Backfill missing timestamp fields for clients that have been used
     * Sets historical timestamps for accounts that were used before timestamp tracking was implemented
     * @param mobile - Mobile number of the buffer client
     * @param doc - Buffer client document
     * @param now - Current timestamp in milliseconds
     */
    private async backfillTimestamps(mobile: string, doc: BufferClient, now: number): Promise<void> {
        const needsBackfill = !doc.privacyUpdatedAt || !doc.profilePicsDeletedAt ||
            !doc.nameBioUpdatedAt || !doc.usernameUpdatedAt ||
            !doc.profilePicsUpdatedAt;

        if (!needsBackfill) {
            this.logger.debug(`Skipping timestamp backfill for ${mobile} (already has all timestamps)`);
            return
        };

        this.logger.log(`Backfilling timestamp fields for ${mobile}`);

        const allTimestamps = ClientHelperUtils.createBackfillTimestamps(now, this.ONE_DAY_MS);
        const backfillData: UpdateBufferClientDto = {};

        if (!doc.privacyUpdatedAt) backfillData.privacyUpdatedAt = allTimestamps.privacyUpdatedAt;
        if (!doc.profilePicsDeletedAt) backfillData.profilePicsDeletedAt = allTimestamps.profilePicsDeletedAt;
        if (!doc.nameBioUpdatedAt) backfillData.nameBioUpdatedAt = allTimestamps.nameBioUpdatedAt;
        if (!doc.usernameUpdatedAt) backfillData.usernameUpdatedAt = allTimestamps.usernameUpdatedAt;
        if (!doc.profilePicsUpdatedAt) backfillData.profilePicsUpdatedAt = allTimestamps.profilePicsUpdatedAt;

        await this.update(mobile, backfillData);
        this.logger.log(`Backfilled ${Object.keys(backfillData).length} timestamp fields for ${mobile}`);
    }

    /**
     * Perform health check on a buffer client
     * Verifies account is still alive and updates lastChecked
     * @param mobile - Client mobile number
     * @param lastChecked - Timestamp of last health check (0 if never checked)
     * @param now - Current timestamp
     * @returns true if health check passed, false otherwise
     */
    private async performHealthCheck(mobile: string, lastChecked: number, now: number): Promise<boolean> {
        const needsHealthCheck = !lastChecked || (now - lastChecked > 7 * this.ONE_DAY_MS);

        if (!needsHealthCheck) {
            this.logger.debug(`Health check not needed for ${mobile} (last checked: ${new Date(lastChecked).toISOString()})`);
            return true; // Health check not needed yet
        }

        try {
            const telegramClient = await connectionManager.getClient(mobile, {
                autoDisconnect: false,
                handler: false,
            });
            await telegramClient.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneCall(),
                    rules: [new Api.InputPrivacyValueDisallowAll()],
                })
            );
            const channels = await channelInfo(telegramClient.client, true);
            await this.update(mobile, {
                channels: channels.ids.length,
                lastChecked: new Date()
            });
            this.logger.debug(`Health check PASSED for ${mobile}`);
            await sleep(5000);
            return true;
        } catch (error) {
            const errorDetails = this.handleError(error, 'Health check failed', mobile);
            this.logger.warn(`Health check failed for ${mobile}: ${errorDetails.message}`);
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(mobile, `Health check failed: ${errorDetails.message}`);
            }
            await sleep(5000);
            return false;
        } finally {
            await connectionManager.unregisterClient(mobile);
        }
    }

    /**
     * Check which updates are pending for a buffer client
     */
    private getPendingUpdates(doc: BufferClient, now: number): {
        needsPrivacy: boolean;
        needsDeletePhotos: boolean;
        needsNameBio: boolean;
        needsUsername: boolean;
        needsProfilePhotos: boolean;
        totalPending: number;
        reasons: string[];
    } {
        const accountAge = doc.createdAt ? now - new Date(doc.createdAt).getTime() : 0;
        const DAY = this.ONE_DAY_MS;
        const MIN_DAYS_BETWEEN_UPDATES = DAY;
        const reasons: string[] = [];

        // Privacy update - accounts 1+ days old, not updated in last 15 days
        const privacyTimestamp = ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt);
        const needsPrivacy = accountAge >= DAY &&
            (privacyTimestamp === 0 || privacyTimestamp < now - 15 * DAY);
        if (needsPrivacy) reasons.push('Privacy update needed');

        // Delete photos - needs privacy done at least 1 day ago
        const privacyDone = privacyTimestamp > 0 && (now - privacyTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const photosDeletedTimestamp = ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt);
        const needsDeletePhotos = accountAge >= 2 * DAY &&
            (photosDeletedTimestamp === 0 || photosDeletedTimestamp < now - 30 * DAY) &&
            (privacyDone || privacyTimestamp === 0);
        if (needsDeletePhotos) reasons.push('Delete photos needed');

        // Name/Bio - needs photos deleted at least 1 day ago, 100+ channels
        const photosDone = photosDeletedTimestamp > 0 && (now - photosDeletedTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const nameBioTimestamp = ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt);
        const needsNameBio = accountAge >= 3 * DAY &&
            (doc.channels || 0) > 100 &&
            (nameBioTimestamp === 0 || nameBioTimestamp < now - 30 * DAY) &&
            (photosDone || photosDeletedTimestamp === 0);
        if (needsNameBio) reasons.push('Name/Bio update needed');

        // Username - needs name/bio done at least 1 day ago, 150+ channels
        const nameBioDone = nameBioTimestamp > 0 && (now - nameBioTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const usernameTimestamp = ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt);
        const needsUsername = accountAge >= 7 * DAY &&
            (doc.channels || 0) > 150 &&
            (usernameTimestamp === 0 || usernameTimestamp < now - 30 * DAY) &&
            (nameBioDone || nameBioTimestamp === 0);
        if (needsUsername) reasons.push('Username update needed');

        // Profile photos - needs username done at least 1 day ago, 170+ channels
        const usernameDone = usernameTimestamp > 0 && (now - usernameTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const profilePicsTimestamp = ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt);
        const needsProfilePhotos = accountAge >= 10 * DAY &&
            (doc.channels || 0) > 170 &&
            (profilePicsTimestamp === 0 || profilePicsTimestamp < now - 30 * DAY) &&
            (usernameDone || usernameTimestamp === 0);
        if (needsProfilePhotos) reasons.push('Profile photos update needed');

        const totalPending = [needsPrivacy, needsDeletePhotos, needsNameBio, needsUsername, needsProfilePhotos]
            .filter(Boolean).length;

        return {
            needsPrivacy,
            needsDeletePhotos,
            needsNameBio,
            needsUsername,
            needsProfilePhotos,
            totalPending,
            reasons
        };
    }

    /**
     * Update privacy settings for a buffer client
     */
    private async updatePrivacySettings(doc: BufferClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            await telegramClient.updatePrivacyforDeletedAccount();
            await this.update(doc.mobile, {
                privacyUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            this.logger.debug(`Updated privacy settings for ${doc.mobile}`);
            await sleep(30000 + Math.random() * 20000);
            return 1;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating privacy', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    /**
     * Delete profile photos for a buffer client
     */
    private async deleteProfilePhotos(doc: BufferClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            const photos = await telegramClient.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));

            if (photos.photos.length > 0) {
                await telegramClient.deleteProfilePhotos();
                this.logger.debug(`Deleted ${photos.photos.length} profile photos for ${doc.mobile}`);
            } else {
                this.logger.debug(`No profile photos to delete for ${doc.mobile}`);
            }

            await this.update(doc.mobile, {
                profilePicsDeletedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            await sleep(30000 + Math.random() * 20000);
            return photos.photos.length > 0 ? 1 : 0;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error deleting photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    /**
     * Update name and bio for a buffer client
     */
    private async updateNameAndBio(doc: BufferClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            const me = await telegramClient.getMe();
            await sleep(5000 + Math.random() * 5000);

            let updateCount = 0;
            if (!isIncludedWithTolerance(safeAttemptReverse(me.firstName), client.name)) {
                this.logger.log(`Updating name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                await telegramClient.updateProfile(
                    `${obfuscateText(client.name, {
                        maintainFormatting: false,
                        preserveCase: true,
                        useInvisibleChars: false
                    })} ${getCuteEmoji()}`,
                    ''
                );
                updateCount = 1;
            }

            await this.update(doc.mobile, {
                nameBioUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            this.logger.debug(`Updated name and bio for ${doc.mobile}`);
            await sleep(30000 + Math.random() * 20000);
            return updateCount;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating profile', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    /**
     * Update username for a buffer client
     */
    private async updateUsername(doc: BufferClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            const me = await telegramClient.getMe();
            await sleep(5000 + Math.random() * 5000);
            await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
            await this.update(doc.mobile, {
                usernameUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            this.logger.debug(`Updated username for ${doc.mobile}`);
            await sleep(30000 + Math.random() * 20000);
            return 1;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating username', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    /**
     * Update profile photos for a buffer client
     */
    private async updateProfilePhotos(doc: BufferClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            const photos = await telegramClient.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));

            let updateCount = 0;
            if (photos.photos.length < 2) {
                await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                await sleep(10000 + Math.random() * 5000);

                const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                const randomPhoto = photoPaths[Math.floor(Math.random() * photoPaths.length)];
                await telegramClient.updateProfilePic(path.join(process.cwd(), randomPhoto));
                updateCount = 1;
                this.logger.debug(`Updated profile photo ${randomPhoto} for ${doc.mobile}`);
            }

            await this.update(doc.mobile, {
                profilePicsUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            await sleep(40000 + Math.random() * 20000);
            return updateCount;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating profile photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    /**
     * Process buffer client updates in priority order
     * Handles privacy, photos, name/bio, username, and profile photos updates
     */
    async processBufferClient(doc: BufferClient, client: Client): Promise<number> {
        if (doc.inUse === true) {
            this.logger.debug(`Buffer client ${doc.mobile} is marked as in use`);
            return 0;
        }

        if (!client) {
            this.logger.warn(`Client not found for buffer client ${doc.mobile}`);
            return 0;
        }

        const MIN_COOLDOWN_HOURS = 2;
        const MAX_FAILED_ATTEMPTS = 3;
        const FAILURE_RESET_DAYS = 7;
        const now = Date.now();
        let updateCount = 0;

        try {
            await sleep(15000 + Math.random() * 10000); // 15-25s initial delay

            // Check if client has too many failed attempts
            const failedAttempts = doc.failedUpdateAttempts || 0;
            const lastFailureTime = ClientHelperUtils.getTimestamp(doc.lastUpdateFailure);

            // Reset failure count if last failure was more than FAILURE_RESET_DAYS ago
            if (failedAttempts > 0 && lastFailureTime > 0 && now - lastFailureTime > FAILURE_RESET_DAYS * this.ONE_DAY_MS) {
                this.logger.log(`Resetting failure count for ${doc.mobile} (last failure was ${Math.floor((now - lastFailureTime) / this.ONE_DAY_MS)} days ago)`);
                await this.update(doc.mobile, {
                    failedUpdateAttempts: 0,
                    lastUpdateFailure: null
                });
            } else if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                this.logger.warn(`Skipping ${doc.mobile} - too many failed attempts (${failedAttempts}). Will retry after ${FAILURE_RESET_DAYS} days.`);
                return 0;
            }

            // Check cooldown
            const lastUpdateAttempt = ClientHelperUtils.getTimestamp(doc.lastUpdateAttempt);
            if (lastUpdateAttempt > 0 && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                this.logger.debug(`Client ${doc.mobile} on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                return 0;
            }

            // Check if recently used
            const lastUsed = ClientHelperUtils.getTimestamp(doc.lastUsed);
            if (lastUsed > 0 && now - lastUsed < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                this.logger.debug(`Client ${doc.mobile} recently used, skipping`);
                return 0;
            }

            // Backfill timestamps for used clients
            if (lastUsed > 0) {
                await this.backfillTimestamps(doc.mobile, doc, now);
                this.logger.debug(`Client ${doc.mobile} has been used, assuming configured`);
                return 0;
            }

            // Check pending updates
            const pendingUpdates = this.getPendingUpdates(doc, now);
            if (pendingUpdates.totalPending > 0) {
                this.logger.debug(`Client ${doc.mobile} has ${pendingUpdates.totalPending} pending updates: ${pendingUpdates.reasons.join(', ')}`);
            } else {
                this.logger.debug(`Client ${doc.mobile} has no pending updates - all complete!`);
            }

            // PRIORITY 1: Privacy update
            if (pendingUpdates.needsPrivacy) {
                updateCount = await this.updatePrivacySettings(doc, client, failedAttempts);
                return updateCount;
            }

            // PRIORITY 2: Delete profile photos
            if (pendingUpdates.needsDeletePhotos) {
                updateCount = await this.deleteProfilePhotos(doc, client, failedAttempts);
                return updateCount;
            }

            // PRIORITY 3: Update name and bio
            if (pendingUpdates.needsNameBio) {
                updateCount = await this.updateNameAndBio(doc, client, failedAttempts);
                return updateCount;
            }

            // PRIORITY 4: Update username
            if (pendingUpdates.needsUsername) {
                updateCount = await this.updateUsername(doc, client, failedAttempts);
                return updateCount;
            }

            // PRIORITY 5: Add profile photos
            if (pendingUpdates.needsProfilePhotos) {
                updateCount = await this.updateProfilePhotos(doc, client, failedAttempts);
                return updateCount;
            }

            // Track attempt even if no updates performed
            if (updateCount === 0) {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                if (pendingUpdates.totalPending > 0) {
                    this.logger.debug(`No updates performed for ${doc.mobile} despite ${pendingUpdates.totalPending} pending. Reasons: ${pendingUpdates.reasons.join(', ')}`);
                }
            } else {
                const remainingPending = pendingUpdates.totalPending - updateCount;
                if (remainingPending > 0) {
                    this.logger.debug(`Client ${doc.mobile} still has ${remainingPending} pending updates`);
                } else {
                    this.logger.log(`✅ Client ${doc.mobile} - ALL UPDATES COMPLETE!`);
                }
            }

            return updateCount;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error with client', doc.mobile);
            try {
                const failedAttempts = doc.failedUpdateAttempts || 0;
                await this.update(doc.mobile, {
                    lastUpdateAttempt: new Date(),
                    failedUpdateAttempts: failedAttempts + 1,
                    lastUpdateFailure: new Date()
                });
            } catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        } finally {
            await sleep(15000 + Math.random() * 10000);
        }
    }

    /**
     * Create a buffer client from a user document
     * @param document - User document with mobile and tgId
     * @param targetClientId - Client ID to assign the buffer client to
     * @param availableDate - Optional availableDate (defaults to today for immediate availability)
     * @returns true if created successfully, false otherwise
     */
    private async createBufferClientFromUser(
        document: { mobile: string; tgId: string },
        targetClientId: string,
        availableDate?: string // Optional - defaults to today
    ): Promise<boolean> {
        const telegramClient = await connectionManager.getClient(document.mobile, {
            autoDisconnect: false,
        });

        try {
            // Check password
            const hasPassword = await telegramClient.hasPassword();
            this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);

            if (hasPassword) {
                this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }

            // Setup 2FA
            await telegramClient.removeOtherAuths();
            await sleep(10000 + Math.random() * 10000);
            await telegramClient.set2fa();
            this.logger.debug('Waiting for setting 2FA');
            await sleep(30000 + Math.random() * 30000);

            // Get channel info and create session
            const channels = await this.telegramService.getChannelInfo(document.mobile, true);
            await sleep(5000 + Math.random() * 5000);
            const newSession = await this.telegramService.createNewSession(document.mobile);

            // Use provided availableDate or default to today
            const targetAvailableDate = availableDate || ClientHelperUtils.getTodayDateString();
            this.logger.debug(`Inserting Document for client ${targetClientId} with availableDate ${targetAvailableDate}`);

            const bufferClient: CreateBufferClientDto = {
                tgId: document.tgId,
                session: newSession,
                mobile: document.mobile,
                lastUsed: null,
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: availableDate
                    ? 'Account successfully configured as buffer client - available immediately'
                    : 'Account successfully configured as buffer client',
            };

            await this.create(bufferClient);
            await this.updateUser2FAStatus(document.tgId, document.mobile);
            this.logger.log(`Created BufferClient for ${targetClientId} with availability ${targetAvailableDate}`);
            return true;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error processing client', document.mobile);
            this.logger.error(`Error processing buffer client ${document.mobile}: ${errorDetails.message}`);
            if (isPermanentError(errorDetails)) {
                try {
                    await this.markAsInactive(document.mobile, errorDetails.message);
                } catch (markError) {
                    this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                }
            }
            return false;
        } finally {
            await this.safeUnregisterClient(document.mobile);
            await sleep(10000 + Math.random() * 5000);
        }
    }

    /**
     * Add new users to buffer clients pool
     * Legacy method - now uses dynamic availability-based calculation internally
     * Maintains backward compatibility with existing API calls
     * 
     * @param badIds - Mobile numbers to exclude from selection
     * @param goodIds - Mobile numbers already in use (active clients, promote clients, assigned buffer clients)
     * @param clientsNeedingBufferClients - Array of client IDs that need more buffer clients
     * @param bufferClientsPerClient - Optional map of current buffer client counts per client
     */
    async addNewUserstoBufferClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingBufferClients: string[] = [],
        bufferClientsPerClient?: Map<string, number>,
    ) {
        // Convert legacy format to dynamic format
        const clientNeedingBufferClientsDynamic: Array<{
            clientId: string;
            totalNeeded: number;
            windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
            totalActive: number;
            totalNeededForCount: number;
            calculationReason: string;
            priority: number;
        }> = [];

        // Calculate needs for each client using dynamic calculation
        for (const clientId of clientsNeedingBufferClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingBufferClientsDynamic.push({
                    clientId,
                    ...availabilityNeeds
                });
            }
        }

        // Sort by priority (most urgent first)
        clientNeedingBufferClientsDynamic.sort((a, b) => a.priority - b.priority);

        // Call dynamic method
        await this.addNewUserstoBufferClientsDynamic(
            badIds,
            goodIds,
            clientNeedingBufferClientsDynamic,
            bufferClientsPerClient
        );
    }

    /**
     * Add new users to buffer clients pool using dynamic availability-based assignment
     * All new buffer clients get availableDate = today (available immediately)
     * Prioritizes by urgency (today > tomorrow > 1 week > 10 days > count only)
     * 
     * @param badIds - Mobile numbers to exclude from selection
     * @param goodIds - Mobile numbers already in use (active clients, promote clients, assigned buffer clients)
     * @param clientsNeedingBufferClients - Array of client needs with priority and window details
     * @param bufferClientsPerClient - Optional map of current buffer client counts per client (for reference)
     */
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

        // Calculate total needed (already sorted by priority)
        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingBufferClients) {
            totalNeeded += clientNeed.totalNeeded;
        }
        // Only global rate limit applies
        totalNeeded = Math.min(totalNeeded, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER);

        if (totalNeeded === 0) {
            this.logger.debug('No buffer clients needed - all availability windows and total count satisfied');
            return;
        }

        this.logger.debug(
            `Creating ${totalNeeded} new buffer clients (all with availableDate = today) ` +
            `to satisfy availability windows and total count requirements`
        );

        // Fetch candidate users
        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: threeMonthsAgo },
                totalChats: { $gt: 150 },
            },
            { tgId: 1 },
            totalNeeded + 5, // Buffer for failures
        );

        // Create assignment queue - prioritize by client priority (already sorted)
        // All new clients get availableDate = today
        const today = new Date().toISOString().split('T')[0];
        const assignmentQueue: Array<{
            clientId: string;
            priority: number;
        }> = [];

        for (const clientNeed of clientsNeedingBufferClients) {
            // Create assignments for each needed buffer client
            // All get availableDate = today (they'll be available immediately)
            for (let i = 0; i < clientNeed.totalNeeded; i++) {
                assignmentQueue.push({
                    clientId: clientNeed.clientId,
                    priority: clientNeed.priority
                });
            }
        }

        let processedCount = 0;
        let assignmentIndex = 0;

        while (
            processedCount < totalNeeded &&
            documents.length > 0 &&
            assignmentIndex < assignmentQueue.length
        ) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }

            const assignment = assignmentQueue[assignmentIndex];
            if (!assignment) {
                this.logger.debug('No more assignments needed');
                break;
            }

            try {
                // All new buffer clients get availableDate = today
                const created = await this.createBufferClientFromUser(
                    document,
                    assignment.clientId,
                    today // Always today - they'll be available immediately
                );

                if (created) {
                    assignmentIndex++;
                    processedCount++;
                    this.logger.debug(
                        `Created buffer client ${document.mobile} for ${assignment.clientId} ` +
                        `with availableDate = ${today} (available immediately, priority: ${assignment.priority})`
                    );
                } else {
                    processedCount++; // Failed but increment to avoid infinite loop
                }
            } catch (error: unknown) {
                const errorDetails = this.handleError(error, 'Error creating client connection', document.mobile);
                this.logger.error(`Error creating connection for ${document.mobile}:`, errorDetails);
                await sleep(10000 + Math.random() * 5000);
                processedCount++;
            }
        }

        this.logger.log(
            `✅ Dynamic batch completed: Created ${processedCount} new buffer clients ` +
            `(all with availableDate = ${today}, available immediately). ` +
            `System maintains availability windows and total count requirements.`
        );
    }

    async updateAllClientSessions() {
        const bufferClients = await this.findAll('active');
        for (let i = 0; i < bufferClients.length; i++) {
            const bufferClient = bufferClients[i];
            try {
                this.logger.log(`Creating new session for mobile: ${bufferClient.mobile} (${i + 1}/${bufferClients.length})`);
                const client = await connectionManager.getClient(bufferClient.mobile, {
                    autoDisconnect: false,
                    handler: true,
                });
                try {
                    const hasPassword = await client.hasPassword();
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await sleep(20000 + Math.random() * 10000); // 20-30s delay
                        await client.set2fa();
                        await sleep(60000 + Math.random() * 30000); // 60-90s delay for 2FA setup
                    }
                    await sleep(5000 + Math.random() * 5000); // Delay before session creation
                    const newSession = await this.telegramService.createNewSession(bufferClient.mobile);
                    await this.update(bufferClient.mobile, {
                        session: newSession,
                        lastUsed: null,
                        message: 'Session updated successfully',
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
                    // Progressive delay between clients to prevent rate limits
                    if (i < bufferClients.length - 1) {
                        await sleep(15000 + Math.random() * 10000); // 15-25s delay between clients
                    }
                }
            } catch (error: unknown) {
                const errorDetails = this.handleError(error, 'Error creating client connection', bufferClient.mobile);
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}: ${errorDetails.message}`);
                // Add delay even on error
                if (i < bufferClients.length - 1) {
                    await sleep(15000 + Math.random() * 10000);
                }
            }
        }
    }

    async getBufferClientsByClientId(clientId: string, status?: string): Promise<BufferClientDocument[]> {
        const filter: Record<string, any> = { clientId };
        if (status) {
            filter.status = status;
        }
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
            totalBufferClients,
            unassignedBufferClients,
            activeBufferClients,
            inactiveBufferClients,
            assignedCounts,
            activeCounts,
            inactiveCounts,
            neverUsedCounts,
            recentlyUsedCounts,
        ] = await Promise.all([
            this.bufferClientModel.countDocuments(),
            this.bufferClientModel.countDocuments({ clientId: { $exists: false } }),
            this.bufferClientModel.countDocuments({ status: 'active' }),
            this.bufferClientModel.countDocuments({ status: 'inactive' }),
            this.bufferClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        lastUsed: { $gte: last24Hours },
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
        ]);

        const assignedCountMap = new Map(assignedCounts.map((item: { _id: string; count: number }) => [item._id, item.count]));
        const activeCountMap = new Map(activeCounts.map((item: { _id: string; count: number }) => [item._id, item.count]));
        const inactiveCountMap = new Map(inactiveCounts.map((item: { _id: string; count: number }) => [item._id, item.count]));
        const neverUsedCountMap = new Map(neverUsedCounts.map((item: { _id: string; count: number }) => [item._id, item.count]));
        const recentlyUsedCountMap = new Map(recentlyUsedCounts.map((item: { _id: string; count: number }) => [item._id, item.count]));

        const distributionPerClient = [];
        let clientsWithSufficient = 0;
        let clientsNeedingMore = 0;
        let totalNeeded = 0;

        for (const client of clients) {
            const assignedCount = assignedCountMap.get(client.clientId) || 0;
            const activeCount = activeCountMap.get(client.clientId) || 0;
            const inactiveCount = inactiveCountMap.get(client.clientId) || 0;
            const neverUsed = neverUsedCountMap.get(client.clientId) || 0;
            const usedInLast24Hours = recentlyUsedCountMap.get(client.clientId) || 0;
            const needed = Math.max(0, this.MIN_TOTAL_BUFFER_CLIENTS - activeCount);
            const status = needed === 0 ? 'sufficient' : 'needs_more';

            distributionPerClient.push({
                clientId: client.clientId,
                assignedCount,
                activeCount,
                inactiveCount,
                needed,
                status,
                neverUsed,
                usedInLast24Hours,
            });

            if (status === 'sufficient') {
                clientsWithSufficient++;
            } else {
                clientsNeedingMore++;
                totalNeeded += needed;
            }
        }

        const maxPerTrigger = this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER;
        const triggersNeeded = Math.ceil(totalNeeded / maxPerTrigger);

        return {
            totalBufferClients,
            unassignedBufferClients,
            activeBufferClients,
            inactiveBufferClients,
            distributionPerClient,
            summary: {
                clientsWithSufficientBufferClients: clientsWithSufficient,
                clientsNeedingBufferClients: clientsNeedingMore,
                totalBufferClientsNeeded: totalNeeded,
                maxBufferClientsPerTrigger: maxPerTrigger,
                triggersNeededToSatisfyAll: triggersNeeded,
            },
        };
    }

    async getBufferClientsByStatus(status: string): Promise<BufferClient[]> {
        return this.bufferClientModel.find({ status }).exec();
    }

    async getBufferClientsWithMessages(): Promise<
        Array<{
            mobile: string;
            status: string;
            message: string;
            clientId?: string;
            lastUsed?: Date;
        }>
    > {
        return this.bufferClientModel
            .find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 })
            .exec();
    }

    async getLeastRecentlyUsedBufferClients(clientId: string, limit: number = 1): Promise<BufferClient[]> {
        return this.bufferClientModel
            .find({
                clientId,
                status: 'active',
                inUse: { $ne: true } // Exclude clients currently in use
            })
            .sort({ lastUsed: 1, _id: 1 })
            .limit(limit)
            .exec();
    }

    async getNextAvailableBufferClient(clientId: string): Promise<BufferClientDocument | null> {
        const clients = await this.getLeastRecentlyUsedBufferClients(clientId, 1);
        return clients.length > 0 ? clients[0] as BufferClientDocument : null;
    }

    async getUnusedBufferClients(hoursAgo: number = 24, clientId?: string): Promise<BufferClientDocument[]> {
        const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const filter: Record<string, any> = {
            status: 'active',
            inUse: { $ne: true }, // Exclude clients currently in use
            $or: [
                { lastUsed: { $lt: cutoffDate } },
                { lastUsed: { $exists: false } },
                { lastUsed: null },
            ],
        };

        if (clientId) {
            filter.clientId = clientId;
        }

        return this.bufferClientModel.find(filter).exec();
    }

    async getUsageStatistics(clientId?: string): Promise<{
        totalClients: number;
        neverUsed: number;
        usedInLast24Hours: number;
        usedInLastWeek: number;
        averageUsageGap: number;
    }> {
        const filter: Record<string, any> = { status: 'active' };
        if (clientId) {
            filter.clientId = clientId;
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);
        const lastWeek = new Date(now.getTime() - 7 * this.ONE_DAY_MS);

        const [
            totalClients,
            neverUsed,
            usedInLast24Hours,
            usedInLastWeek,
            allClients,
        ] = await Promise.all([
            this.bufferClientModel.countDocuments(filter),
            this.bufferClientModel.countDocuments({
                ...filter,
                $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
            }),
            this.bufferClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: last24Hours },
            }),
            this.bufferClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: lastWeek },
            }),
            this.bufferClientModel.find(filter, { lastUsed: 1, createdAt: 1 }).exec(),
        ]);

        let totalGap = 0;
        let gapCount = 0;

        for (const client of allClients) {
            if (client.lastUsed) {
                const gap = now.getTime() - new Date(client.lastUsed).getTime();
                totalGap += gap;
                gapCount++;
            }
        }

        const averageUsageGap = gapCount > 0 ? totalGap / gapCount / (60 * 60 * 1000) : 0;

        return {
            totalClients,
            neverUsed,
            usedInLast24Hours,
            usedInLastWeek,
            averageUsageGap,
        };
    }

    async markAsUsed(mobile: string, message?: string): Promise<BufferClientDocument> {
        const updateData: UpdateBufferClientDto = { lastUsed: new Date() };
        if (message) {
            updateData.message = message;
        }

        return this.update(mobile, updateData);
    }
}