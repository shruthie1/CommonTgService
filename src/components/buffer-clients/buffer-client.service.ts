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
import { getCuteEmoji, getRandomEmoji, Logger, obfuscateText } from '../../utils';
import { ActiveChannel } from '../active-channels';
import { SearchBufferClientDto } from './dto/search-buffer- client.dto';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import TelegramManager from '../Telegram/TelegramManager';
import { Client } from '../clients';
import path from 'path';
import { CloudinaryService } from '../../cloudinary';
import { Api } from 'telegram';
import isPermanentError from '../../utils/isPermanentError';
import { isIncludedWithTolerance, safeAttemptReverse } from '../../utils/checkMe.utils';
import { BotsService, ChannelCategory } from '../bots';

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
        private botsService: BotsService,
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
        query: any,
        sort?: any,
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
        status: string,
        message?: string,
    ): Promise<BufferClientDocument> {
        const updateData: any = { status };
        if (message) {
            updateData.message = message;
        }
        await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return await this.update(mobile, updateData);
    }

    async markAsInactive(mobile: string, reason: string): Promise<BufferClientDocument> {
        try {
            this.logger.log(`Marking buffer client ${mobile} as inactive: ${reason}`);
            return await this.updateStatus(mobile, 'inactive', reason);
        } catch (error) {
            this.logger.error(`Failed to mark buffer client ${mobile} as inactive: ${error.message}`);
        }
    }

    async updateInfo() {
        const clients = await this.bufferClientModel
            .find({
                status: 'active',
                lastChecked: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            })
            .sort({ channels: 1 })
            .limit(25);

        this.logger.debug(`Updating info for ${clients.length} buffer clients`);

        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client.mobile;

            try {
                this.logger.info(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);

                const telegramClient = await connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });
                await telegramClient.client.invoke(
                    new Api.account.SetPrivacy({
                        key: new Api.InputPrivacyKeyPhoneCall(),
                        rules: [
                            new Api.InputPrivacyValueDisallowAll()
                        ],
                    })
                );

                const channels = await channelInfo(telegramClient.client, true);
                this.logger.debug(`${mobile}: Found ${channels.ids.length} existing channels`,);
                await this.update(mobile, { channels: channels.ids.length, lastChecked: new Date() });
            } catch (error) {
                const errorDetails = parseError(error, `Failed to UpdatedClient: ${mobile}`);
                if (isPermanentError(errorDetails)) {
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

                // Add delay between client processing to avoid rate limits
                if (i < clients.length - 1) {
                    await sleep(12000 + Math.random() * 8000); // Increased to 12-20 seconds between each client
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
                const errorDetails = parseError(error, `JoinChannelErr: ${mobile}`);
                const errorMsg = errorDetails?.message || error?.errorMessage || 'Unknown error';
                if (isPermanentError(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
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
                if (!currentChannel) {
                    this.logger.debug(`No channel to process for ${mobile}, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    continue;
                }
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing:`, `@${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                const activeChannel: ActiveChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                if (activeChannel && activeChannel.banned == true) { // add DeletedCount  condition also if required
                    this.logger.debug(`Skipping Channel ${activeChannel.channelId} as it is banned`);
                    // Still add delay even when skipping to maintain rate limiting
                    await sleep(5000 + Math.random() * 3000);
                    continue;
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
                        await sleep(10000 + Math.random() * 5000); // Increased delay on FloodWaitError

                        if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
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

                if (isPermanentError(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
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
        await connectionManager.unregisterClient(mobile);
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
        const MIN_COOLDOWN_HOURS = 4; // Same cooldown as in processBufferClient
        const now = Date.now();

        for (const result of bufferClientCounts) {
            bufferClientsPerClient.set(result._id, result.count);
            if (totalUpdates < 5) {
                for (const bufferClientMobile of result.mobiles) {
                    const bufferClient = await this.findOne(bufferClientMobile, false);
                    if (!bufferClient) {
                        this.logger.warn(`Buffer client ${bufferClientMobile} not found, skipping`);
                        continue;
                    }

                    // Check cooldown before processing
                    const lastUpdateAttempt = (bufferClient as any).lastUpdateAttempt
                        ? new Date((bufferClient as any).lastUpdateAttempt).getTime()
                        : 0;
                    if (lastUpdateAttempt && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                        const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                        this.logger.debug(`Skipping ${bufferClientMobile} - on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                        continue;
                    }

                    // Check if in use
                    if (bufferClient.inUse === true) {
                        this.logger.debug(`Skipping ${bufferClientMobile} - currently in use`);
                        continue;
                    }

                    const client = clients.find((c) => c.clientId === result._id);
                    if (!client) {
                        this.logger.warn(`Client with ID ${result._id} not found, skipping buffer client ${bufferClientMobile}`);
                        continue;
                    }
                    const currentUpdates = await this.processBufferClient(bufferClient, client);
                    this.logger.debug(`Processed buffer client ${bufferClientMobile} for client ${result._id}, current updates: ${currentUpdates} | total updates: ${totalUpdates + currentUpdates}`);
                    if (currentUpdates > 0) {
                        totalUpdates += currentUpdates;
                    }
                    if (totalUpdates >= 5) {
                        this.logger.warn('Reached total update limit of 5 for this check cycle');
                        break;
                    }
                }
            } else {
                this.logger.warn(`Skipping buffer client ${result.mobiles.join(', ')} as total updates reached 5`);
            }
        }

        for (const client of clients) {
            const assignedCount = bufferClientsPerClient.get(client.clientId) || 0;
            // No need to set it again, it's already in the map from the aggregation

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

        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Buffer Client Check:\n\nTotal Active Buffer Clients: ${totalActiveBufferClients}\nBuffer Clients Per Client: ${JSON.stringify(Object.fromEntries(bufferClientsPerClient))}\nClients Needing Buffer Clients: ${clientNeedingBufferClients.join(', ')}\nTotal Slots Needed: ${totalSlotsNeeded}`)}`);

        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoBufferClients([], goodIds, clientNeedingBufferClients, bufferClientsPerClient);
        } else {
            this.logger.debug('No new buffer clients needed - all clients have sufficient buffer clients');
        }
    }

    /**
     * Check which updates are pending for a buffer client
     * Returns information about what needs to be updated
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
        const oneDay = 24 * 60 * 60 * 1000;
        const twoDays = 2 * oneDay;
        const threeDays = 3 * oneDay;
        const sevenDays = 7 * oneDay;
        const tenDays = 10 * oneDay;
        const thirtyDays = 30 * oneDay;
        const fifteenDays = 15 * oneDay;
        const MIN_DAYS_BETWEEN_UPDATE_TYPES = 2 * oneDay;
        const reasons: string[] = [];

        // Privacy update - always needed if account is 1-30 days old and not updated in last 15 days
        const needsPrivacy = accountAge >= oneDay && accountAge <= thirtyDays &&
            (!doc.privacyUpdatedAt || (new Date(doc.privacyUpdatedAt).getTime() < now - fifteenDays));
        if (needsPrivacy) reasons.push('Privacy update needed');

        // Delete photos - needs privacy updated at least 2 days ago OR privacy not done yet (will be done first)
        const privacyUpdatedRecently = doc.privacyUpdatedAt &&
            (now - new Date(doc.privacyUpdatedAt).getTime() >= MIN_DAYS_BETWEEN_UPDATE_TYPES);
        const needsDeletePhotos = accountAge >= twoDays && accountAge <= thirtyDays &&
            (!doc.profilePicsDeletedAt || (new Date(doc.profilePicsDeletedAt).getTime() < now - thirtyDays)) &&
            (privacyUpdatedRecently || !doc.privacyUpdatedAt); // Allow if privacy was never updated (will be done first)
        if (needsDeletePhotos) reasons.push('Delete photos needed');
        else if (accountAge >= twoDays && accountAge <= thirtyDays && !privacyUpdatedRecently && doc.privacyUpdatedAt) {
            reasons.push('Delete photos waiting for privacy update to age (2 days)');
        }

        // Name/Bio - needs photos deleted at least 2 days ago OR photos not deleted yet
        const photosDeletedRecently = doc.profilePicsDeletedAt &&
            (now - new Date(doc.profilePicsDeletedAt).getTime() >= MIN_DAYS_BETWEEN_UPDATE_TYPES);
        const needsNameBio = accountAge >= threeDays && accountAge <= thirtyDays &&
            doc.channels > 100 &&
            (!doc.nameBioUpdatedAt || (new Date(doc.nameBioUpdatedAt).getTime() < now - thirtyDays)) &&
            (photosDeletedRecently || !doc.profilePicsDeletedAt); // Allow if photos not deleted yet
        if (needsNameBio) reasons.push('Name/Bio update needed');
        else if (accountAge >= threeDays && accountAge <= thirtyDays && doc.channels > 100 && !photosDeletedRecently && doc.profilePicsDeletedAt) {
            reasons.push('Name/Bio waiting for photo deletion to age (2 days)');
        }

        // Username - needs name/bio updated at least 2 days ago OR name/bio not updated yet
        const nameBioUpdatedRecently = doc.nameBioUpdatedAt &&
            (now - new Date(doc.nameBioUpdatedAt).getTime() >= MIN_DAYS_BETWEEN_UPDATE_TYPES);
        const needsUsername = accountAge >= sevenDays && accountAge <= thirtyDays &&
            doc.channels > 150 &&
            (!doc.usernameUpdatedAt || (new Date(doc.usernameUpdatedAt).getTime() < now - thirtyDays)) &&
            (nameBioUpdatedRecently || !doc.nameBioUpdatedAt); // Allow if name/bio not updated yet
        if (needsUsername) reasons.push('Username update needed');
        else if (accountAge >= sevenDays && accountAge <= thirtyDays && doc.channels > 150 && !nameBioUpdatedRecently && doc.nameBioUpdatedAt) {
            reasons.push('Username waiting for name/bio update to age (2 days)');
        }

        // Profile photos - needs username updated at least 2 days ago OR username not updated yet
        const usernameUpdatedRecently = doc.usernameUpdatedAt &&
            (now - new Date(doc.usernameUpdatedAt).getTime() >= MIN_DAYS_BETWEEN_UPDATE_TYPES);
        const needsProfilePhotos = accountAge >= tenDays && accountAge <= thirtyDays &&
            doc.channels > 170 &&
            (!doc.profilePicsUpdatedAt || (new Date(doc.profilePicsUpdatedAt).getTime() < now - thirtyDays)) &&
            (usernameUpdatedRecently || !doc.usernameUpdatedAt); // Allow if username not updated yet
        if (needsProfilePhotos) reasons.push('Profile photos update needed');
        else if (accountAge >= tenDays && accountAge <= thirtyDays && doc.channels > 170 && !usernameUpdatedRecently && doc.usernameUpdatedAt) {
            reasons.push('Profile photos waiting for username update to age (2 days)');
        }

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

    async processBufferClient(doc: BufferClient, client: Client): Promise<number> {
        // Check if client is currently in use (more accurate check)
        if (doc.inUse === true) {
            this.logger.debug(`[BufferClientService] Buffer client ${doc.mobile} is marked as in use`);
            return 0;
        }

        // Validate client parameter
        if (!client) {
            this.logger.warn(`[BufferClientService] Client not found for buffer client ${doc.mobile}`);
            return 0;
        }

        let cli: TelegramManager;
        const MAX_UPDATES_PER_RUN = 1; // CRITICAL: Only ONE update per client per run to avoid Telegram anti-bot triggers
        const MIN_COOLDOWN_HOURS = 4; // Minimum 4 hours between any updates
        const MIN_DAYS_BETWEEN_UPDATE_TYPES = 2; // Minimum 2 days between different update types
        let updateCount = 0; // Local variable to track updates for this specific client

        try {
            // Random initial delay to avoid patterned client connections
            await sleep(15000 + Math.random() * 10000); // 15-25s - increased delay
            // Check if account is at risk of rate-limiting
            const lastUsed = doc.lastUsed ? new Date(doc.lastUsed).getTime() : 0;
            const lastUpdateAttempt = (doc as any).lastUpdateAttempt ? new Date((doc as any).lastUpdateAttempt).getTime() : 0;
            const now = Date.now();

            // Check cooldown from last update attempt (more strict)
            if (lastUpdateAttempt && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                this.logger.debug(`[BufferClientService] Client ${doc.mobile} on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                return 0;
            }

            // Also check lastUsed for additional safety
            if (lastUsed && now - lastUsed < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                this.logger.debug(`[BufferClientService] Client ${doc.mobile} recently used, skipping to avoid rate limits`);
                return 0;
            }

            // Check pending updates and log them
            const pendingUpdates = this.getPendingUpdates(doc, now);
            if (pendingUpdates.totalPending > 0) {
                this.logger.debug(`[BufferClientService] Client ${doc.mobile} has ${pendingUpdates.totalPending} pending updates: ${pendingUpdates.reasons.join(', ')}`);
            } else {
                this.logger.debug(`[BufferClientService] Client ${doc.mobile} has no pending updates - all updates complete!`);
            }
            // Privacy update for accounts older than 1 day - PRIORITY 1 (safest, do first)
            // Use pending updates check to ensure we don't skip this
            if (
                updateCount < MAX_UPDATES_PER_RUN &&
                pendingUpdates.needsPrivacy
            ) {
                try {
                    cli = await connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });

                    await sleep(5000 + Math.random() * 5000); // 5-10s delay before operation
                    await cli.updatePrivacyforDeletedAccount();
                    await this.update(doc.mobile, {
                        privacyUpdatedAt: new Date(),
                        lastUpdateAttempt: new Date() // Track update attempt
                    } as UpdateBufferClientDto);
                    updateCount++;
                    this.logger.debug(`[BufferClientService] Updated privacy settings for ${doc.mobile}`);
                    await sleep(30000 + Math.random() * 20000); // 30-50s delay after operation
                    return updateCount; // Exit after one update
                } catch (error: any) {
                    const errorDetails = parseError(error, `Error in Updating Privacy: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdateBufferClientDto); // Track attempt even on failure
                    if (isPermanentError(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    // On transient error, return to prevent further updates this cycle
                    return updateCount;
                }
            }

            // Delete profile photos for accounts 2+ days old - PRIORITY 2
            // Only proceed if privacy was updated at least MIN_DAYS_BETWEEN_UPDATE_TYPES days ago (or not updated yet - will be done first)
            if (
                updateCount < MAX_UPDATES_PER_RUN &&
                pendingUpdates.needsDeletePhotos
            ) {
                try {
                    cli = await connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });

                    await sleep(5000 + Math.random() * 5000); // 5-10s delay before operation
                    const photos = await cli.client.invoke(
                        new Api.photos.GetUserPhotos({
                            userId: 'me',
                            offset: 0,
                        })
                    );
                    if (photos.photos.length > 0) {
                        await cli.deleteProfilePhotos();
                        await this.update(doc.mobile, {
                            profilePicsDeletedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        } as UpdateBufferClientDto);
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Deleted profile photos for ${doc.mobile}`);
                        await sleep(30000 + Math.random() * 20000); // 30-50s delay after operation
                        return updateCount; // Exit after one update
                    }
                } catch (error: any) {
                    const errorDetails = parseError(error, `Error in Deleting Photos: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    if (isPermanentError(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    return updateCount;
                }
            }

            // Update name and bio for accounts older than 3 days with 100+ channels - PRIORITY 3
            // Only proceed if previous updates were done at least MIN_DAYS_BETWEEN_UPDATE_TYPES days ago (or not done yet)
            if (
                updateCount < MAX_UPDATES_PER_RUN &&
                pendingUpdates.needsNameBio
            ) {
                cli = await connectionManager.getClient(doc.mobile, {
                    autoDisconnect: true,
                    handler: false,
                });
                await sleep(5000 + Math.random() * 5000); // 5-10s delay before operation
                const me = await cli.getMe();
                await sleep(5000 + Math.random() * 5000); // Additional 5-10s delay after getting user info
                if (!isIncludedWithTolerance(safeAttemptReverse(me.firstName), client.name)) {
                    try {
                        this.logger.log(`[BufferClientService] Updating first name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                        await cli.updateProfile(
                            `${obfuscateText(client.name, {
                                maintainFormatting: false,
                                preserveCase: true,
                                useInvisibleChars: false
                            })} ${getCuteEmoji()}`,
                            ''
                        );
                        await this.update(doc.mobile, {
                            nameBioUpdatedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        } as UpdateBufferClientDto);
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Updated name and bio for ${doc.mobile}`);
                        await sleep(30000 + Math.random() * 20000); // 30-50s delay after operation
                        return updateCount; // Exit after one update
                    } catch (error: any) {
                        const errorDetails = parseError(error, `Error in Updating Profile: ${doc.mobile}`, true);
                        await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                        if (isPermanentError(errorDetails)) {
                            await this.markAsInactive(doc.mobile, errorDetails.message);
                            return updateCount;
                        }
                        return updateCount;
                    }
                }
            }

            // Update username for accounts older than 7 days with 150+ channels - PRIORITY 4
            // Only proceed if name/bio was updated at least MIN_DAYS_BETWEEN_UPDATE_TYPES days ago (or not done yet)
            if (
                updateCount < MAX_UPDATES_PER_RUN &&
                pendingUpdates.needsUsername
            ) {
                try {
                    cli = await connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });
                    await sleep(5000 + Math.random() * 5000); // 5-10s delay before operation
                    const me = await cli.getMe();
                    await sleep(5000 + Math.random() * 5000); // Additional 5-10s delay
                    await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
                    await this.update(doc.mobile, {
                        usernameUpdatedAt: new Date(),
                        lastUpdateAttempt: new Date()
                    } as UpdateBufferClientDto);
                    updateCount++;
                    this.logger.debug(`[BufferClientService] Updated username for ${doc.mobile}`);
                    await sleep(30000 + Math.random() * 20000); // 30-50s delay after operation
                    return updateCount; // Exit after one update
                } catch (error: any) {
                    const errorDetails = parseError(error, `Error in Updating Username: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    if (isPermanentError(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    return updateCount;
                }
            }

            // Add profile photos for accounts older than 10 days with no photos - PRIORITY 5 (last, most risky)
            // Only proceed if username was updated at least MIN_DAYS_BETWEEN_UPDATE_TYPES days ago (or not done yet)
            // AND only add ONE photo per cycle (not multiple)
            if (
                updateCount < MAX_UPDATES_PER_RUN &&
                pendingUpdates.needsProfilePhotos
            ) {
                try {
                    cli = await connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });
                    await sleep(5000 + Math.random() * 5000); // 5-10s delay before operation
                    const rootPath = process.cwd();
                    const photos = await cli.client.invoke(
                        new Api.photos.GetUserPhotos({
                            userId: 'me',
                            offset: 0,
                        })
                    );
                    if (photos.photos.length < 2) {
                        await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                        await sleep(10000 + Math.random() * 5000); // 10-15s delay before photo upload
                        // CRITICAL: Only add ONE photo per cycle to avoid triggering anti-bot
                        const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                        const randomPhoto = photoPaths[Math.floor(Math.random() * photoPaths.length)];
                        await cli.updateProfilePic(path.join(rootPath, randomPhoto));
                        await this.update(doc.mobile, {
                            profilePicsUpdatedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        } as UpdateBufferClientDto);
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Updated profile photo ${randomPhoto} for ${doc.mobile} (1 of ${photoPaths.length} photos)`);
                        await sleep(40000 + Math.random() * 20000); // 40-60s delay after photo upload (longer for photos)
                        return updateCount; // Exit after one update
                    }
                } catch (error: any) {
                    const errorDetails = parseError(error, `Error in Updating Profile Photos: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    if (isPermanentError(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    return updateCount;
                }
            }

            // If no updates were performed, still track the attempt to prevent rapid retries
            if (updateCount === 0) {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdateBufferClientDto);
                // Log why no updates were performed
                if (pendingUpdates.totalPending > 0) {
                    this.logger.debug(`[BufferClientService] No updates performed for ${doc.mobile} despite ${pendingUpdates.totalPending} pending updates. Reasons: ${pendingUpdates.reasons.join(', ')}`);
                }
            } else {
                // Log remaining pending updates after this update
                const remainingPending = pendingUpdates.totalPending - updateCount;
                if (remainingPending > 0) {
                    this.logger.debug(`[BufferClientService] Client ${doc.mobile} still has ${remainingPending} pending updates remaining`);
                } else {
                    this.logger.log(`[BufferClientService] ✅ Client ${doc.mobile} - ALL UPDATES COMPLETE! Ready for use.`);
                }
            }
            
            return updateCount; // Return number of updates performed
        } catch (error: any) {
            const errorDetails = parseError(error, `Error with client ${doc.mobile}`);
            // Track attempt even on error
            try {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdateBufferClientDto);
            } catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, `${errorDetails.message}`);
            }
            return 0; // Return 0 on error
        } finally {
            try {
                if (cli) await connectionManager.unregisterClient(doc.mobile);
            } catch (unregisterError: any) {
                this.logger.error(`[BufferClientService] Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
            await sleep(15000 + Math.random() * 10000); // 15-25s final delay (increased)
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
                        await sleep(30000 + Math.random() * 30000); // Increased to 30-60s for 2FA setup
                        const channels = await this.telegramService.getChannelInfo(document.mobile, true);
                        await sleep(5000 + Math.random() * 5000); // Delay before session creation
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

                        // Only update tracker if we actually created a buffer client
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
                    } else {
                        this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA status for ${document.mobile}:`, userUpdateError);
                        }
                        // Don't update tracker or increment processedCount if we didn't create a buffer client
                    }
                } catch (error: any) {
                    const errorDetails = parseError(error, `Error processing client ${document.mobile}`);
                    this.logger.error(`Error processing buffer client ${document.mobile}:`, errorDetails);
                    if (isPermanentError(errorDetails)) {
                        try {
                            await this.markAsInactive(document.mobile, errorDetails.message);
                        } catch (markError) {
                            this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                        }
                    }
                    processedCount++;
                } finally {
                    try {
                        await connectionManager.unregisterClient(document.mobile);
                    } catch (unregisterError: any) {
                        this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                    }
                    // Add delay between client processing even on errors
                    await sleep(10000 + Math.random() * 5000);
                }
            } catch (error: any) {
                const errorDetails = parseError(error, `Error creating client connection for ${document.mobile}`);
                this.logger.error(`Error creating connection for ${document.mobile}:`, errorDetails);
                // Add delay even on error to prevent rapid retries
                await sleep(10000 + Math.random() * 5000);
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
                } catch (error: any) {
                    const errorDetails = parseError(error, `Failed to create new session for ${bufferClient.mobile}`);
                    if (isPermanentError(errorDetails)) {
                        await this.update(bufferClient.mobile, {
                            status: 'inactive',
                            message: `Session update failed: ${errorDetails.message}`,
                        });
                    }
                } finally {
                    await connectionManager.unregisterClient(bufferClient.mobile);
                    // Progressive delay between clients to prevent rate limits
                    if (i < bufferClients.length - 1) {
                        await sleep(15000 + Math.random() * 10000); // 15-25s delay between clients
                    }
                }
            } catch (error: any) {
                const errorDetails = parseError(error, `Error creating client connection for ${bufferClient.mobile}`);
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}: ${errorDetails.message}`);
                // Add delay even on error
                if (i < bufferClients.length - 1) {
                    await sleep(15000 + Math.random() * 10000);
                }
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
        const filter: any = {
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
}