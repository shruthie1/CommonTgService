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
import { contains, getRandomEmoji, Logger, obfuscateText } from '../../utils';
import { ActiveChannel } from '../active-channels';
import { SearchBufferClientDto } from './dto/search-buffer- client.dto';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import TelegramManager from '../Telegram/TelegramManager';
import { Client } from '../clients';
import path from 'path';
import { CloudinaryService } from '../../cloudinary';
import { Api } from 'telegram';

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
    private readonly MAX_NEEDED = 160;

    // Per-client buffer client management constants
    private readonly MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER = 10; // Rate limiting constant
    private readonly MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT = 10; // Max buffer clients per client

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
    ) { }

    async onModuleDestroy() {
        // this.logger.log('Cleaning up BufferClientService resources');
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

            // this.logger.log('BufferClientService cleanup completed');
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

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClientDocument> {
        // Ensure status is set to 'active' by default if not provided
        return await this.bufferClientModel.create({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
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
        // Allow updating status as well
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate(
                { mobile },
                { $set: updateClientDto },
                { new: true, upsert: true, returnDocument: 'after' },
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
            this.logger.log('Updating');
            return this.update(
                existingBufferClient.mobile,
                createorUpdateBufferClientDto as UpdateBufferClientDto,
            );
        } else {
            this.logger.log('creating');
            // Ensure status is set to 'active' by default if not provided
            return this.create({
                ...createorUpdateBufferClientDto,
                status: (createorUpdateBufferClientDto as any).status || 'active',
            } as CreateBufferClientDto);
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
            await fetchWithTimeout(
                `${notifbot()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}\n${message}`)}`,
            );
            await this.bufferClientModel.deleteOne({ mobile }).exec();
        } catch (error) {
            const errorDetails = parseError(error);
            this.logger.error(
                `Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`,
            );
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }
    async search(filter: SearchBufferClientDto): Promise<BufferClientDocument[]> {
        if (filter.tgId == "refresh") {
            this.updateAllClientSessions();
            return []
        }
        return await this.bufferClientModel.find(filter).exec();
    }

    async executeQuery(
        query: any,
        sort?: any,
        limit?: number,
        skip?: number,
    ): Promise<BufferClientDocument[]> {
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
        status: string,
        message?: string,
    ): Promise<BufferClientDocument> {
        const updateData: any = { status };
        if (message) {
            updateData.message = message;
        }

        return this.update(mobile, updateData);
    }

    async markAsInactive(mobile: string, reason: string): Promise<BufferClientDocument> {
        return this.updateStatus(mobile, 'inactive', reason);
    }

    async updateInfo() {
        const clients = await this.bufferClientModel
            .find({
                status: 'active',
            })
            .sort({ channels: 1 });

        this.logger.debug(`Updating info for ${clients.length} buffer clients`);

        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client.mobile;

            try {
                this.logger.debug(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);

                const telegramClient = await connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });

                const channels = await channelInfo(telegramClient.client, true);
                this.logger.debug(
                    `${mobile}: Found ${channels.ids.length} existing channels`,
                );

                await this.update(mobile, { channels: channels.ids.length });
            } catch (error) {
                const errorDetails = parseError(error);
                if (this.isPermanentError(errorDetails)) {
                    try {
                        await this.markAsInactive(mobile, `${errorDetails.message}`);
                    } catch (markError) {
                        this.logger.error(
                            `Error marking client ${mobile} as inactive:`,
                            markError,
                        );
                    }
                }
                this.logger.error(
                    `Error updating info for client ${mobile}:`,
                    errorDetails,
                );
            } finally {
                try {
                    await connectionManager.unregisterClient(mobile);
                } catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }

                // Add delay between client processing
                if (i < clients.length - 1) {
                    await sleep(8000 + Math.random() * 4000); // Increased to 8-12 seconds between each client
                }
            }
        }

        this.logger.debug('Completed updating info for all buffer clients');
    }

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
        const query: any = {
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

                const errorDetails = parseError(error);
                const errorMsg =
                    errorDetails?.message || error?.errorMessage || 'Unknown error';

                if (
                    contains(errorMsg, [
                        'SESSION_REVOKED',
                        'AUTH_KEY_UNREGISTERED',
                        'USER_DEACTIVATED',
                        'USER_DEACTIVATED_BAN',
                        'FROZEN_METHOD_INVALID',
                    ])
                ) {
                    this.logger.error(`Session invalid for ${mobile} due to ${errorMsg}, removing client`);
                    try {
                        await this.remove(mobile, `JoinChannelError: ${errorDetails.message}`);
                        await sleep(4000 + Math.random() * 2000); // Delay after removal
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
                    this.logger.error(
                        `Error unregistering client ${mobile}:`,
                        unregisterError,
                    );
                }

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
            await this.processJoinChannelInterval();
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
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing:`, `@${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                const activeChannel: ActiveChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                if (activeChannel && activeChannel.banned == true) { // add DeletedCount  condition also if required
                    this.logger.debug(`Skipping Channel ${activeChannel.channelId} as it is banned`)
                } else {
                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                }
            } catch (error: any) {
                const errorDetails = parseError(
                    error,
                    `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `,
                    false,
                );
                this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);

                if (
                    errorDetails.error === 'FloodWaitError' ||
                    error.errorMessage === 'CHANNELS_TOO_MUCH'
                ) {
                    this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                    this.removeFromBufferMap(mobile);

                    try {
                        await sleep(4000 + Math.random() * 2000);
                        const channelsInfo = await this.telegramService.getChannelInfo(
                            mobile,
                            true,
                        );
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    } catch (updateError) {
                        this.logger.error(`Error updating channel count for ${mobile}:`, updateError);
                    }
                }

                if (
                    contains(errorDetails.message, [
                        'SESSION_REVOKED',
                        'AUTH_KEY_UNREGISTERED',
                        'USER_DEACTIVATED',
                        'USER_DEACTIVATED_BAN',
                        'FROZEN_METHOD_INVALID',
                        'not found'
                    ])
                ) {
                    this.logger.error(`Session invalid for ${mobile}, removing client`);
                    this.removeFromBufferMap(mobile);
                    try {
                        await this.remove(mobile, `Process JoinChannelError: ${errorDetails.message}`);
                        await sleep(4000 + Math.random() * 2000);
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
                    // this.logger.log(
                    //     `Sleeping for ${this.CHANNEL_PROCESSING_DELAY} before continuing with next Mobile`,
                    // );
                    await sleep(this.CHANNEL_PROCESSING_DELAY + Math.random() * 10000);
                } else {
                    this.logger.log(`Not Sleeping before continuing with next Mobile`);
                }
            }
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            // this.logger.debug(`Clearing join channel interval: ${this.joinChannelIntervalId}`,);
            clearInterval(this.joinChannelIntervalId);
            this.activeTimeouts.delete(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
        this.isJoinChannelProcessing = false;
        // this.logger.debug('Join channel processing cleared and flag reset');
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
            await this.processLeaveChannelInterval();
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
            } catch (error: any) {
                const errorDetails = parseError(
                    error,
                    `${mobile} Leave Channel ERR: `,
                    false,
                );

                if (
                    contains(errorDetails.message, [
                        'SESSION_REVOKED',
                        'AUTH_KEY_UNREGISTERED',
                        'USER_DEACTIVATED',
                        'USER_DEACTIVATED_BAN',
                        'FROZEN_METHOD_INVALID',
                    ])
                ) {
                    this.logger.error(`Session invalid for ${mobile}, removing client`);
                    try {
                        await this.remove(mobile, `Process LeaveChannel: ${errorDetails.message}`);
                        await sleep(4000 + Math.random() * 2000);
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
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }

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
        availableDate: string = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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

        const existingAssignment = await this.bufferClientModel.findOne({ mobile, clientId: { $exists: true } });

        if (!clientMobiles.includes(mobile) && !existingAssignment) {
            const telegramClient = await connectionManager.getClient(mobile, {
                autoDisconnect: false
            });
            try {
                await telegramClient.set2fa();
                await sleep(30000 + Math.random() * 15000); // Increased to 30-45s
                const channels = await this.telegramService.getChannelInfo(mobile, true);
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
                const errorDetails = parseError(error);
                throw new HttpException(errorDetails.message, errorDetails.status);
            }
            await connectionManager.unregisterClient(mobile);
            return 'Client set as buffer successfully';
        } else {
            throw new BadRequestException('Number is an Active Client');
        }
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
        const clientNeedingBufferClients: string[] = [];

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
        for (const result of bufferClientCounts) {
            bufferClientsPerClient.set(result._id, result.count);
            if (totalUpdates < 5) {
                for (const bufferClientMobile of result.mobiles) {
                    const bufferClient = await this.findOne(bufferClientMobile);
                    const client = clients.find((c) => c.clientId === result._id);
                    totalUpdates += await this.processBufferClient(bufferClient, client);
                }
            } else {
                this.logger.warn(`Skipping buffer client ${result.mobiles.join(', ')} as total updates reached 5`);
            }
        }

        for (const client of clients) {
            const assignedCount = bufferClientsPerClient.get(client.clientId) || 0;
            bufferClientsPerClient.set(client.clientId, assignedCount);

            const needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - assignedCount);
            if (needed > 0) {
                clientNeedingBufferClients.push(client.clientId);
            }
        }

        let totalSlotsNeeded = 0;

        for (const clientId of clientNeedingBufferClients) {
            if (totalSlotsNeeded >= this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER) break;

            const assignedCount = bufferClientsPerClient.get(clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - assignedCount);
            const allocatedForThisClient = Math.min(needed, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER - totalSlotsNeeded);

            totalSlotsNeeded += allocatedForThisClient;
        }

        this.logger.debug(`Buffer clients per client: ${JSON.stringify(Object.fromEntries(bufferClientsPerClient))}`);
        this.logger.debug(`Clients needing buffer clients: ${clientNeedingBufferClients.join(', ')}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER} per trigger)`);

        const totalActiveBufferClients = await this.bufferClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active buffer clients: ${totalActiveBufferClients}`);

        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoBufferClients([], goodIds, clientNeedingBufferClients, bufferClientsPerClient);
        } else {
            this.logger.debug('No new buffer clients needed - all clients have sufficient buffer clients');
        }
    }

    async processBufferClient(doc: BufferClient, client: Client): Promise<number> {
        if (doc.inUse && doc.lastUsed !== null) {
            this.logger.debug(`[BufferClientService] Buffer client ${doc.mobile} is already in use`);
            return 0;
        }

        let cli: TelegramManager;
        let updateCount = 0; // Track number of updates performed
        const MAX_UPDATES_PER_RUN = 2; // Limit to 2 profile updates per run to avoid spam flags

        try {
            // Random initial delay to avoid patterned client connections
            await sleep(10000 + Math.random() * 5000); // 10-15s

            cli = await connectionManager.getClient(doc.mobile, {
                autoDisconnect: true,
                handler: false,
            });

            // Check if account is at risk of rate-limiting
            const lastUsed = doc.lastUsed ? new Date(doc.lastUsed).getTime() : 0;
            const now = Date.now();
            if (lastUsed && now - lastUsed < 30 * 60 * 1000) { // 30-minute cooldown
                this.logger.warn(`[BufferClientService] Client ${doc.mobile} recently used, skipping to avoid rate limits`);
                return 0;
            }

            const me = await cli.getMe();
            await sleep(5000 + Math.random() * 10000); // 5-15s delay after getting user info

            // Privacy update for accounts older than 1 day
            if (
                doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) &&
                (!doc.privacyUpdatedAt || doc.privacyUpdatedAt < new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN
            ) {
                try {
                    await cli.updatePrivacyforDeletedAccount();
                    await this.update(doc.mobile, { privacyUpdatedAt: new Date() });
                    updateCount++;
                    this.logger.debug(`[BufferClientService] Updated privacy settings for ${doc.mobile}`);
                    await sleep(20000 + Math.random() * 15000); // 20-35s delay
                } catch (error: any) {
                    this.logger.warn(`[BufferClientService] Failed to update privacy for ${doc.mobile}: ${error.message}`);
                    if (this.isPermanentError(error)) {
                        await this.markAsInactive(doc.mobile, `Rate limit hit during privacy update: ${error.message}`);
                    }
                }
            }

            // Delete profile photos for accounts 2+ days old
            if (
                doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) &&
                (!doc.profilePicsDeletedAt || doc.profilePicsDeletedAt < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN
            ) {
                try {
                    const photos = await cli.client.invoke(
                        new Api.photos.GetUserPhotos({
                            userId: 'me',
                            offset: 0,
                        })
                    );
                    if (photos.photos.length > 0) {
                        await cli.deleteProfilePhotos();
                        await this.update(doc.mobile, { profilePicsDeletedAt: new Date() });
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Deleted profile photos for ${doc.mobile}`);
                        await sleep(20000 + Math.random() * 15000); // 20-35s delay
                    }
                } catch (error: any) {
                    this.logger.warn(`[BufferClientService] Failed to delete photos for ${doc.mobile}: ${error.message}`);
                    if (this.isPermanentError(error)) {
                        await this.markAsInactive(doc.mobile, `Rate limit hit during photo deletion: ${error.message}`);
                    }
                }
            }

            // Update name and bio for accounts older than 3 days with 100+ channels
            if (
                doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) &&
                doc.channels > 100 &&
                (!doc.nameBioUpdatedAt || doc.nameBioUpdatedAt < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN
            ) {
                if (me.firstName !== client.name) {
                    try {
                        this.logger.log(`[BufferClientService] Updating first name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                        await cli.updateProfile(
                            client.name,
                            obfuscateText(`Genuine Paid Girl${getRandomEmoji()}, Best Services${getRandomEmoji()}`, {
                                maintainFormatting: false,
                                preserveCase: true,
                            })
                        );
                        await this.update(doc.mobile, { nameBioUpdatedAt: new Date() });
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Updated name and bio for ${doc.mobile}`);
                        await sleep(20000 + Math.random() * 15000); // 20-35s delay
                    } catch (error: any) {
                        this.logger.warn(`[BufferClientService] Failed to update profile for ${doc.mobile}: ${error.message}`);
                        if (this.isPermanentError(error)) {
                            await this.markAsInactive(doc.mobile, `Rate limit hit during profile update: ${error.message}`);
                        }
                    }
                }
            }

            // Update username for accounts older than 7 days with 150+ channels
            if (
                doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) &&
                doc.channels > 150 &&
                (!doc.usernameUpdatedAt || doc.usernameUpdatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN
            ) {
                try {
                    await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
                    await this.update(doc.mobile, { usernameUpdatedAt: new Date() });
                    updateCount++;
                    this.logger.debug(`[BufferClientService] Updated username for ${doc.mobile}`);
                    await sleep(20000 + Math.random() * 15000); // 20-35s delay
                } catch (error: any) {
                    this.logger.warn(`[BufferClientService] Failed to update username for ${doc.mobile}: ${error.message}`);
                    if (this.isPermanentError(error)) {
                        await this.markAsInactive(doc.mobile, `Rate limit hit during username update: ${error.message}`);
                    }
                }
            }

            // Add profile photos for accounts older than 10 days with no photos
            if (
                doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) &&
                doc.channels > 170 &&
                (!doc.profilePicsUpdatedAt || doc.profilePicsUpdatedAt < new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN
            ) {
                try {
                    const rootPath = process.cwd();
                    const photos = await cli.client.invoke(
                        new Api.photos.GetUserPhotos({
                            userId: 'me',
                            offset: 0,
                        })
                    );
                    if (photos.photos.length < 1) {
                        await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                        await sleep(6000 + Math.random() * 3000); // 6-9s delay
                        // Add new profile photos with staggered delays
                        const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                        for (const photo of photoPaths) {
                            if (updateCount >= MAX_UPDATES_PER_RUN) break;
                            await cli.updateProfilePic(path.join(rootPath, photo));
                            updateCount++;
                            this.logger.debug(`[BufferClientService] Updated profile photo ${photo} for ${doc.mobile}`);
                            await sleep(20000 + Math.random() * 15000); // 20-35s delay per photo
                        }
                        await this.update(doc.mobile, { profilePicsUpdatedAt: new Date() });
                    }
                } catch (error: any) {
                    this.logger.warn(`[BufferClientService] Failed to update profile photos for ${doc.mobile}: ${error.message}`);
                    if (this.isPermanentError(error)) {
                        await this.markAsInactive(doc.mobile, `Rate limit hit during photo update: ${error.message}`);
                    }
                }
            }

            return updateCount; // Return true if any updates were performed
        } catch (error: any) {
            this.logger.error(`[BufferClientService] Error with client ${doc.mobile}: ${error.message}`);
            const errorDetails = parseError(error);
            if (this.isPermanentError(errorDetails)) {
                try {
                    await this.remove(doc.mobile, `Process BufferClient Error: ${error.message}`);
                    await sleep(6000 + Math.random() * 3000); // 6-9s delay
                } catch (removeError) {
                    this.logger.error(`[BufferClientService] Error removing client ${doc.mobile}: ${removeError}`);
                }
            }
            return 0; // Return false on error
        } finally {
            try {
                if (cli) await connectionManager.unregisterClient(doc.mobile);
            } catch (unregisterError: any) {
                this.logger.error(`[BufferClientService] Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
            await sleep(10000 + Math.random() * 5000); // 10-15s final delay
        }
    }

    async addNewUserstoBufferClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingBufferClients: string[] = [],
        bufferClientsPerClient?: Map<string, number>,
    ) {
        const sixMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

        let totalNeededFromClients = 0;
        for (const clientId of clientsNeedingBufferClients) {
            let needed = 0;
            if (bufferClientsPerClient) {
                const currentCount = bufferClientsPerClient.get(clientId) || 0;
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            } else {
                const currentCount = await this.bufferClientModel.countDocuments({
                    clientId,
                    status: 'active',
                });
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            }
            totalNeededFromClients += needed;
        }

        const totalNeeded = Math.min(totalNeededFromClients, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER);

        if (totalNeeded === 0) {
            this.logger.debug('No buffer clients needed - all clients have sufficient buffer clients or limit reached');
            return;
        }

        this.logger.debug(`Limited to creating ${totalNeeded} new buffer clients (max ${this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER} per trigger)`);

        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: sixMonthsAgo },
                totalChats: { $gt: 150 },
            },
            { tgId: 1 },
            totalNeeded + 5,
        );

        this.logger.debug(`New buffer documents to be added: ${documents.length} for ${clientsNeedingBufferClients.length} clients needing buffer clients (limited to ${totalNeeded})`);

        let processedCount = 0;
        const clientAssignmentTracker = new Map<string, number>();

        for (const clientId of clientsNeedingBufferClients) {
            let needed = 0;
            if (bufferClientsPerClient) {
                const currentCount = bufferClientsPerClient.get(clientId) || 0;
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            } else {
                const currentCount = await this.bufferClientModel.countDocuments({
                    clientId,
                    status: 'active',
                });
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            }
            clientAssignmentTracker.set(clientId, needed);
        }

        while (
            processedCount < Math.min(totalNeeded, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER) &&
            documents.length > 0 &&
            clientsNeedingBufferClients.length > 0
        ) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }

            let targetClientId: string | null = null;
            for (const clientId of clientsNeedingBufferClients) {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                if (needed > 0) {
                    targetClientId = clientId;
                    break;
                }
            }

            if (!targetClientId) {
                this.logger.debug('All clients have sufficient buffer clients assigned');
                break;
            }

            try {
                const client = await connectionManager.getClient(document.mobile, {
                    autoDisconnect: false,
                });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await sleep(10000 + Math.random() * 10000);
                        await client.set2fa();
                        this.logger.debug('Waiting for setting 2FA');
                        await sleep(20000 + Math.random() * 20000); // Increased to 30-60s
                        const channels = await this.telegramService.getChannelInfo(document.mobile, true);
                        const newSession = await this.telegramService.createNewSession(document.mobile);
                        this.logger.debug(`Inserting Document for client ${targetClientId}`);
                        const bufferClient: CreateBufferClientDto = {
                            tgId: document.tgId,
                            session: newSession,
                            mobile: document.mobile,
                            lastUsed: null,
                            availableDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            clientId: targetClientId,
                            status: 'active',
                            message: 'Account successfully configured as buffer client',
                        };
                        await this.create(bufferClient);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA status for ${document.mobile}:`, userUpdateError);
                        }
                        this.logger.log(`=============Created BufferClient for ${targetClientId}==============`);
                    } else {
                        this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA status for ${document.mobile}:`, userUpdateError);
                        }
                    }

                    const currentNeeded = clientAssignmentTracker.get(targetClientId) || 0;
                    const newNeeded = Math.max(0, currentNeeded - 1);
                    clientAssignmentTracker.set(targetClientId, newNeeded);

                    if (newNeeded === 0) {
                        const index = clientsNeedingBufferClients.indexOf(targetClientId);
                        if (index > -1) {
                            clientsNeedingBufferClients.splice(index, 1);
                        }
                    }

                    this.logger.debug(`Client ${targetClientId}: ${newNeeded} more needed, ${totalNeeded - processedCount - 1} remaining in this batch`);
                    processedCount++;
                } catch (error: any) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`);
                    parseError(error);
                    processedCount++;
                } finally {
                    try {
                        await connectionManager.unregisterClient(document.mobile);
                    } catch (unregisterError: any) {
                        this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                    }
                }
            } catch (error: any) {
                this.logger.error(`Error creating client connection for ${document.mobile}: ${error.message}`);
                parseError(error);
            }
        }

        this.logger.log(`✅ Batch completed: Created ${processedCount} new buffer clients (max ${totalNeeded} per trigger)`);
        if (clientsNeedingBufferClients.length > 0) {
            const stillNeeded = clientsNeedingBufferClients
                .map((clientId) => {
                    const needed = clientAssignmentTracker.get(clientId) || 0;
                    return `${clientId}:${needed}`;
                })
                .join(', ');
            this.logger.log(`⏳ Still needed in future triggers: ${stillNeeded}`);
        } else {
            this.logger.log(`🎉 All clients now have sufficient buffer clients!`);
        }
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
                        await sleep(20000 + Math.random() * 10000);
                        await client.set2fa();
                        await sleep(60000 + Math.random() * 30000); // Increased to 60-90s
                    }
                    const newSession = await this.telegramService.createNewSession(bufferClient.mobile);
                    await this.update(bufferClient.mobile, {
                        session: newSession,
                        lastUsed: null,
                        message: 'Session updated successfully',
                    });
                } catch (error: any) {
                    this.logger.error(`Failed to create new session for ${bufferClient.mobile}: ${error.message}`);
                    const errorDetails = parseError(error);
                    await this.update(bufferClient.mobile, {
                        status: 'inactive',
                        message: `Session update failed: ${errorDetails.message}`,
                    });
                } finally {
                    await connectionManager.unregisterClient(bufferClient.mobile);
                    await sleep(10000 + Math.random() * 5000); // Increased to 10-15s
                }
            } catch (error: any) {
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}: ${error.message}`);
                parseError(error);
            }
        }
    }

    async getBufferClientsByClientId(clientId: string, status?: string): Promise<BufferClientDocument[]> {
        const filter: any = { clientId };
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
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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

        const assignedCountMap = new Map(assignedCounts.map((item: any) => [item._id, item.count]));
        const activeCountMap = new Map(activeCounts.map((item: any) => [item._id, item.count]));
        const inactiveCountMap = new Map(inactiveCounts.map((item: any) => [item._id, item.count]));
        const neverUsedCountMap = new Map(neverUsedCounts.map((item: any) => [item._id, item.count]));
        const recentlyUsedCountMap = new Map(recentlyUsedCounts.map((item: any) => [item._id, item.count]));

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
            const needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - activeCount);
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
            .find({ clientId, status: 'active' })
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
        const filter: any = {
            status: 'active',
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
        const filter: any = { status: 'active' };
        if (clientId) {
            filter.clientId = clientId;
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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
        const updateData: any = { lastUsed: new Date() };
        if (message) {
            updateData.message = message;
        }

        return this.update(mobile, updateData);
    }

    async isPermanentError(errorDetails: { error: any, message: string, status: number }): Promise<boolean> {
        return contains(errorDetails.message, [
            'SESSION_REVOKED',
            'AUTH_KEY_UNREGISTERED',
            'USER_DEACTIVATED',
            'USER_DEACTIVATED_BAN',
            'FROZEN_METHOD_INVALID',
        ])
    }
}