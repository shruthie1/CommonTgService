import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import {
    BadRequestException,
    ConflictException,
    HttpException,
    Inject,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    OnModuleDestroy,
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
import { getCuteEmoji, getRandomPetName, Logger, obfuscateText } from '../../utils';
import { ActiveChannel } from '../active-channels';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import { getProfilePics } from '../Telegram/utils/getProfilePics';
import { deleteProfilePhotos } from '../Telegram/utils/deleteProfilePics';
import isPermanentError from '../../utils/isPermanentError';
import { Api } from 'telegram';
import { Client } from '../clients/schemas/client.schema';
import TelegramManager from '../Telegram/TelegramManager';
import { CloudinaryService } from '../../cloudinary';
import path from 'path';
import { isIncludedWithTolerance, safeAttemptReverse } from '../../utils/checkMe.utils';
import { BotsService, ChannelCategory } from '../bots';
import { ClientHelperUtils } from '../shared/client-helper.utils';

@Injectable()
export class PromoteClientService implements OnModuleDestroy {
    private readonly logger = new Logger(PromoteClientService.name);
    private joinChannelMap: Map<string, (Channel | ActiveChannel)[]> = new Map();
    private leaveChannelMap: Map<string, string[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout | null = null;
    private leaveChannelIntervalId: NodeJS.Timeout | null = null;
    private isLeaveChannelProcessing: boolean = false;
    private isJoinChannelProcessing: boolean = false;
    private activeTimeouts: Set<NodeJS.Timeout> = new Set();
    private readonly JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000; // 4 minutes
    private readonly LEAVE_CHANNEL_INTERVAL = 60 * 1000; // 1 minute
    private readonly LEAVE_CHANNEL_BATCH_SIZE = 10;
    private readonly MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER = 10;
    private readonly MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT = 12;
    private readonly MAX_MAP_SIZE = 100;
    private readonly CHANNEL_PROCESSING_DELAY = 10000; // 10 seconds
    private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
    private cleanupIntervalId: NodeJS.Timeout | null = null;

    // Date/time constants
    private readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;
    private readonly THREE_MONTHS_MS = 3 * 30 * this.ONE_DAY_MS;
    private readonly INACTIVE_USER_CUTOFF_DAYS = 90; // 3 months

    // Dynamic availability configuration
    private readonly MIN_TOTAL_PROMOTE_CLIENTS = 12; // Minimum total per client
    private readonly AVAILABILITY_WINDOWS = [
        { name: 'today', days: 0, minRequired: 3 },
        { name: 'tomorrow', days: 1, minRequired: 5 },
        { name: 'oneWeek', days: 7, minRequired: 7 },
        { name: 'tenDays', days: 10, minRequired: 9 }
    ];

    constructor(
        @InjectModel(PromoteClient.name)
        private promoteClientModel: Model<PromoteClientDocument>,
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
        @Inject(forwardRef(() => BufferClientService))
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => SessionService))
        private sessionService: SessionService,
        private botsService: BotsService
    ) { }

    private startMemoryCleanup(): void {
        if (this.cleanupIntervalId) return; // Avoid duplicate intervals
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
                    this.logger.debug(`Cleaning up empty joinChannelMap entry for mobile: ${mobile}`);
                    this.joinChannelMap.delete(mobile);
                }
            }

            // Clean up empty entries in leaveChannelMap
            for (const [mobile, channels] of this.leaveChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    this.logger.debug(`Cleaning up empty leaveChannelMap entry for mobile: ${mobile}`);
                    this.leaveChannelMap.delete(mobile);
                }
            }

            // Trim maps if exceeding max size
            this.trimMapIfNeeded(this.joinChannelMap, 'joinChannelMap');
            this.trimMapIfNeeded(this.leaveChannelMap, 'leaveChannelMap');

            this.logger.debug(`Memory cleanup completed. Maps sizes - Join: ${this.joinChannelMap.size}, Leave: ${this.leaveChannelMap.size}`);
        } catch (error) {
            this.logger.error('Error during memory cleanup:', error);
        }
    }

    private trimMapIfNeeded<T>(map: Map<string, T>, mapName: string): void {
        if (map.size > this.MAX_MAP_SIZE) {
            const keysToRemove = Array.from(map.keys()).slice(this.MAX_MAP_SIZE);
            keysToRemove.forEach(key => map.delete(key));
            this.logger.warn(`Trimmed ${keysToRemove.length} entries from ${mapName}`);
        }
    }

    async create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient> {
        const promoteClientData = {
            ...promoteClient,
            status: promoteClient.status || 'active',
            message: promoteClient.message || 'Account is functioning properly',
        };
        const newUser = new this.promoteClientModel(promoteClientData);
        const result = await newUser.save();
        this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Promote Client Created:\n\nMobile: ${promoteClient.mobile}`);
        return result;
    }

    async findAll(statusFilter?: string): Promise<PromoteClient[]> {
        const filter = statusFilter ? { status: statusFilter } : {};
        return this.promoteClientModel.find(filter).exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<PromoteClient> {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user;
    }

    async update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
        const updatedUser = await this.promoteClientModel
            .findOneAndUpdate(
                { mobile },
                { $set: updateClientDto },
                { new: true, returnDocument: 'after' },
            )
            .exec();

        if (!updatedUser) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }

        return updatedUser;
    }

    async updateStatus(mobile: string, status: 'active' | 'inactive', message?: string): Promise<PromoteClient> {
        const updateData: UpdatePromoteClientDto = { status };
        if (message) {
            updateData.message = message;
        }
        await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, `Promote Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return this.update(mobile, updateData);
    }

    async updateLastUsed(mobile: string): Promise<PromoteClient> {
        return this.update(mobile, { lastUsed: new Date() });
    }

    async markAsUsed(mobile: string, message?: string): Promise<PromoteClient> {
        const updateData: UpdatePromoteClientDto = { lastUsed: new Date() };
        if (message) {
            updateData.message = message;
        }
        return this.update(mobile, updateData);
    }

    async markAsInactive(mobile: string, reason: string): Promise<PromoteClient> {
        this.logger.log(`Marking promote client ${mobile} as inactive: ${reason}`);
        try {
            return await this.updateStatus(mobile, 'inactive', reason);
        } catch (error) {
            this.logger.error(`Failed to mark promote client ${mobile} as inactive: ${error.message}`);
        }
    }

    async markAsActive(mobile: string, message: string = 'Account is functioning properly'): Promise<PromoteClient> {
        return this.updateStatus(mobile, 'active', message);
    }

    async createOrUpdate(
        mobile: string,
        createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto,
    ): Promise<PromoteClient> {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            this.logger.debug(`Updating existing promote client: ${mobile}`);
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdatePromoteClientDto);
        } else {
            this.logger.debug(`Creating new promote client: ${mobile}`);
            return this.create(createOrUpdateUserDto as CreatePromoteClientDto);
        }
    }

    async remove(mobile: string, message?: string): Promise<void> {
        try {
            this.logger.log(`Removing PromoteClient with mobile: ${mobile}`);

            const deleteResult = await this.promoteClientModel.deleteOne({ mobile }).exec();

            if (deleteResult.deletedCount === 0) {
                throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }

            await fetchWithTimeout(
                `${notifbot()}&text=${encodeURIComponent(`${process.env.serviceName || process.env.clientId} Deleting Promote Client : ${mobile}\n${message}`)}`,
            );
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            const errorDetails = parseError(error);
            this.logger.error(`[${mobile}] Error removing PromoteClient: ${errorDetails.message}`, errorDetails);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`[${mobile}] PromoteClient removed successfully`);
    }

    async search(filter: Partial<PromoteClient>): Promise<PromoteClient[]> {
        this.logger.debug(`Modified filter:`, filter);
        return this.promoteClientModel.find(filter).exec();
    }

    async executeQuery(
        query: Record<string, any>,
        sort?: Record<string, any>,
        limit?: number,
        skip?: number,
    ): Promise<PromoteClient[]> {
        if (!query) {
            throw new BadRequestException('Query is invalid.');
        }

        try {
            const queryExec = this.promoteClientModel.find(query);
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

    removeFromPromoteMap(key: string) {
        const deleted = this.joinChannelMap.delete(key);
        if (deleted) {
            this.logger.debug(`Removed ${key} from join channel map`);
        }
    }

    clearPromoteMap() {
        this.logger.debug('PromoteMap cleared');
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }

    async updateInfo() {
        const clients = await this.promoteClientModel
            .find({ status: 'active', lastChecked: { $lt: new Date(Date.now() - 7 * this.ONE_DAY_MS) } })
            .sort({ channels: 1 })
            .limit(25);

        const now = Date.now();
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client?.mobile;
            this.logger.info(`Processing PromoteClient (${i + 1}/${clients.length}): ${mobile}`);
            
            const lastChecked = client.lastChecked 
                ? new Date(client.lastChecked).getTime() 
                : 0;
            await this.performHealthCheck(mobile, lastChecked, now);
            
            // Increased delay to avoid rate limits
            if (i < clients.length - 1) {
                await sleep(12000 + Math.random() * 8000); // 12-20 seconds between each client
            }
        }
    }

    async joinchannelForPromoteClients(skipExisting: boolean = true): Promise<string> {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Active client setup exists, skipping promotion process');
            return 'Active client setup exists, skipping promotion';
        }

        this.logger.log('Starting join channel process');
        this.clearAllMapsAndIntervals();

        await sleep(6000 + Math.random() * 3000); // Increased initial delay to reduce CPU spike

        try {
            const existingKeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.promoteClientModel
                .find({
                    channels: { $lt: 350 },
                    mobile: { $nin: existingKeys },
                    status: 'active',
                })
                .sort({ channels: 1 })
                .limit(16);

            this.logger.debug(`Found ${clients.length} clients to process for joining channels`);

            const joinSet = new Set<string>();
            const leaveSet = new Set<string>();
            let successCount = 0;
            let failCount = 0;

            for (const document of clients) {
                const mobile = document.mobile;
                this.logger.debug(`Processing client: ${mobile}`);

                try {
                    const client = await connectionManager.getClient(mobile, {
                        autoDisconnect: false,
                        handler: false,
                    });

                    await sleep(5000 + Math.random() * 3000); // 5-8s delay before channel info
                    const channels = await channelInfo(client.client, true);
                    this.logger.debug(`[${mobile}]: Found ${channels.ids.length} existing channels`);
                    await sleep(5000 + Math.random() * 3000); // 5-8s delay before update
                    await this.update(mobile, { channels: channels.ids.length });

                    if (channels.ids.length > 100) {
                        await sleep(5000 + Math.random() * 3000); // Delay before profile pic operations
                        const profilePics = await getProfilePics(client.client);
                        if (profilePics.length > 0) {
                            await deleteProfilePhotos(client.client, profilePics);
                            await sleep(10000 + Math.random() * 5000); // Delay after deletion
                        }
                    }

                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = channels.ids;
                        const channelLimit = 150;
                        await sleep(5000 + Math.random() * 3000); // Increased delay before getting channels
                        const isBelowThreshold = channels.ids.length < 220;

                        const result: (Channel | ActiveChannel)[] = isBelowThreshold
                            ? await this.activeChannelsService.getActiveChannels(channelLimit, 0, excludedIds)
                            : await this.channelsService.getActiveChannels(channelLimit, 0, excludedIds);

                        if (!this.joinChannelMap.has(mobile)) {
                            this.joinChannelMap.set(mobile, result);
                            this.trimMapIfNeeded(this.joinChannelMap, 'joinChannelMap'); // Trim after add
                            joinSet.add(mobile);
                        } else {
                            this.logger.debug(`[${mobile}]: Already in join queue, skipping re-add`);
                        }
                        await this.sessionService.getOldestSessionOrCreate({ mobile: document.mobile });
                    } else {
                        this.logger.debug(`[${mobile}]: Too many blocked channels (${channels.canSendFalseCount}), preparing for leave`);
                        if (!this.leaveChannelMap.has(mobile)) {
                            this.leaveChannelMap.set(mobile, channels.canSendFalseChats);
                            this.trimMapIfNeeded(this.leaveChannelMap, 'leaveChannelMap'); // Trim after add
                            leaveSet.add(mobile);
                        } else {
                            this.logger.debug(`[${mobile}]: Already in leave queue, skipping re-add`);
                        }
                    }

                    successCount++;
                } catch (error) {
                    failCount++;
                    const errorDetails = parseError(error);
                    this.logger.error(`[${mobile}] Error processing client:`, errorDetails);
                    if (isPermanentError(errorDetails)) {
                        await sleep(1000);
                        await this.markAsInactive(mobile, `${errorDetails.message}`);
                    } else {
                        this.logger.warn(`[${mobile}]: Non-fatal error encountered, will retry later`);
                    }
                } finally {
                    await this.safeUnregisterClient(mobile);
                    // Progressive delay between clients to prevent rate limits
                    await sleep(8000 + Math.random() * 5000); // 8-13s delay between clients
                }
            }

            await sleep(6000 + Math.random() * 3000); // Increased delay before starting queues

            if (joinSet.size > 0) {
                this.startMemoryCleanup();
                this.logger.debug(`Starting join queue for ${joinSet.size} clients`);
                this.createTimeout(() => this.joinChannelQueue(), 2000);
            }

            if (leaveSet.size > 0) {
                this.logger.debug(`Starting leave queue for ${leaveSet.size} clients`);
                this.createTimeout(() => this.leaveChannelQueue(), 5000);
            }

            this.logger.log(`Join channel process completed for ${clients.length} clients (Success: ${successCount}, Failed: ${failCount})`);
            return `Initiated Joining channels for ${joinSet.size} | Queued for leave: ${leaveSet.size}`;
        } catch (error) {
            this.logger.error('Unexpected error during joinchannelForPromoteClients:', error);
            this.clearAllMapsAndIntervals();
            throw new Error('Failed to initiate channel joining process');
        }
    }
    private clearAllMapsAndIntervals(): void {
        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
    }

    async joinChannelQueue() {
        if (this.isJoinChannelProcessing) {
            this.logger.warn('Join channel process is already running');
            return;
        }

        if (this.joinChannelMap.size === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }

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

        if (this.joinChannelMap.size === 0) {
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
            if (this.joinChannelMap.size === 0) {
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
                    this.removeFromPromoteMap(mobile);
                    continue;
                }

                currentChannel = channels.shift();
                if (!currentChannel) {
                    this.logger.debug(`No channel to process for ${mobile}, removing from queue`);
                    this.removeFromPromoteMap(mobile);
                    continue;
                }
                this.logger.debug(`[${mobile}] Processing channel: @${currentChannel.username} (${channels.length} remaining)`);
                this.joinChannelMap.set(mobile, channels);

                let activeChannel = null;
                try {
                    activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                } catch (findError) {
                    this.logger.warn(`Error fetching active channel ${currentChannel.channelId}:`, findError);
                }

                // Check for banned, deleted, or null
                if (!activeChannel || activeChannel.banned || (activeChannel.deletedCount && activeChannel.deletedCount > 0)) {
                    this.logger.debug(`Skipping invalid/banned/deleted channel ${currentChannel.channelId}`);
                    // Still add delay even when skipping to maintain rate limiting
                    await sleep(5000 + Math.random() * 3000);
                    continue;
                }

                await this.telegramService.tryJoiningChannel(mobile, currentChannel);
            } catch (error: any) {
                const errorDetails = parseError(
                    error,
                    `[${mobile}] ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `,
                    false,
                );

                if (
                    errorDetails.error === 'FloodWaitError' ||
                    error.errorMessage === 'CHANNELS_TOO_MUCH'
                ) {
                    this.logger.warn(`[${mobile}] FloodWaitError or too many channels, removing from queue`);
                    this.removeFromPromoteMap(mobile);

                    await sleep(10000 + Math.random() * 5000); // Increased delay on FloodWaitError
                    if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
                        await this.update(mobile, { channels: 400 });
                    } else {
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    }
                }

                if (isPermanentError(errorDetails)) {
                    this.removeFromPromoteMap(mobile);
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                if (
                    i < keys.length - 1 ||
                    this.joinChannelMap.get(mobile)?.length > 0
                ) {
                    await sleep(this.CHANNEL_PROCESSING_DELAY);
                }
            }
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval`);
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
        if (this.isLeaveChannelProcessing) {
            this.logger.warn('Leave channel process is already running');
            return;
        }

        if (this.leaveChannelMap.size === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }

        if (!this.leaveChannelIntervalId) {
            this.logger.debug('Starting leave channel interval');
            this.leaveChannelIntervalId = setInterval(async () => {
                await this.processLeaveChannelInterval();
            }, this.LEAVE_CHANNEL_INTERVAL);
            this.activeTimeouts.add(this.leaveChannelIntervalId);
            await this.processLeaveChannelInterval();
        } else {
            this.logger.warn('Leave channel interval is already running');
        }
    }

    private async processLeaveChannelInterval() {
        if (this.isLeaveChannelProcessing) {
            this.logger.debug('Leave channel process already running, skipping interval');
            return;
        }

        if (this.leaveChannelMap.size === 0) {
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
            if (this.leaveChannelMap.size === 0) {
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

                const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                this.logger.debug(`[${mobile}] Processing ${channelsToProcess.length} channels to leave (${channels.length} remaining)`);

                if (channels.length > 0) {
                    this.leaveChannelMap.set(mobile, channels);
                } else {
                    this.removeFromLeaveMap(mobile);
                }

                const client = await connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });

                await sleep(5000 + Math.random() * 3000); // Increased delay before leaving channels
                await client.leaveChannels(channelsToProcess);
                this.logger.debug(`[${mobile}] Successfully left ${channelsToProcess.length} channels`);
            } catch (error: any) {
                const errorDetails = parseError(error, `[${mobile}] Leave Channel ERR: `, false);
                if (isPermanentError(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                    this.removeFromLeaveMap(mobile);
                } else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorDetails.message}`);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                if (
                    i < keys.length - 1 ||
                    this.leaveChannelMap.get(mobile)?.length > 0
                ) {
                    await sleep((this.LEAVE_CHANNEL_INTERVAL / 2) + Math.random() * 30000); // Add randomness to delay
                }
            }
        }
    }

    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval`);
            clearInterval(this.leaveChannelIntervalId);
            this.activeTimeouts.delete(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
    }

    private async safeUnregisterClient(mobile: string): Promise<void> {
        try {
            await connectionManager.unregisterClient(mobile);
        } catch (unregisterError: unknown) {
            const errorMessage = unregisterError instanceof Error ? unregisterError.message : 'Unknown error';
            this.logger.error(`Error unregistering client ${mobile}: ${errorMessage}`);
        }
    }

    async setAsPromoteClient(
        mobile: string,
        availableDate: string = ClientHelperUtils.getTodayDateString(),
    ) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new BadRequestException('User not found');
        }

        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new ConflictException('PromoteClient already exists');
        }

        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);

        // Check if mobile is already an active client
        if (clientMobiles.includes(mobile)) {
            throw new BadRequestException('Number is an Active Client');
        }

        // If we reach here, promote client doesn't exist (checked above) and mobile is not an active client
        const telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false });
        try {
            await telegramClient.set2fa();
            await sleep(30000 + Math.random() * 30000); // 30-60s delay for 2FA setup
            await sleep(5000 + Math.random() * 5000); // Delay before username update
            await telegramClient.updateUsername('');
            await sleep(10000 + Math.random() * 5000); // 10-15s delay after username
            await telegramClient.updatePrivacyforDeletedAccount();
            await sleep(10000 + Math.random() * 5000); // 10-15s delay after privacy
            await telegramClient.updateProfile('Deleted Account', 'Deleted Account');
            await sleep(10000 + Math.random() * 5000); // 10-15s delay after profile
            await telegramClient.deleteProfilePhotos();
            await sleep(10000 + Math.random() * 5000); // 10-15s delay after photo deletion
            const channels = await this.telegramService.getChannelInfo(mobile, true);

            const promoteClient = {
                tgId: user.tgId,
                lastActive: 'default',
                mobile: user.mobile,
                availableDate,
                channels: channels.ids.length,
                status: 'active',
                message: 'Manually configured as promote client',
                lastUsed: null,
            };

            await this.promoteClientModel
                .findOneAndUpdate(
                    { mobile: user.mobile },
                    { $set: promoteClient },
                    { new: true, upsert: true },
                )
                .exec();
        } catch (error) {
            const errorDetails = parseError(error);
            throw new HttpException(errorDetails.message, errorDetails.status);
        } finally {
            await this.safeUnregisterClient(mobile);
        }
        return 'Client set as promote successfully';
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
     * Helper method for consistent error handling
     * Parses errors and returns standardized error details
     */
    private handleError(error: unknown, context: string, mobile?: string): ReturnType<typeof parseError> {
        const contextWithMobile = mobile ? `${context}: ${mobile}` : context;
        return parseError(error, contextWithMobile, false);
    }

    /**
     * Calculate availability-based promote client needs for a specific client
     * Checks availability across multiple time windows (today, tomorrow, 1 week, 10 days)
     * Returns how many new promote clients are needed to maintain minimum availability
     * 
     * Key: availableDate means "available from" - client is available on/after that date
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

        // Get total active count
        const totalActive = await this.promoteClientModel.countDocuments({
            clientId,
            status: 'active'
        });

        const windowNeeds = [];
        let maxNeeded = 0;
        let mostUrgentWindow = '';
        let mostUrgentPriority = 999;

        for (const window of windows) {
            // Count how many promote clients are available on or before this window's date
            // Key: availableDate <= targetDate means available on/after that date
            const availableCount = await this.promoteClientModel.countDocuments({
                clientId,
                status: 'active',
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
        const totalNeededForCount = Math.max(0, this.MIN_TOTAL_PROMOTE_CLIENTS - totalActive);

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
            calculationReason = `Total count needs ${totalNeededForCount} to reach minimum of ${this.MIN_TOTAL_PROMOTE_CLIENTS}`;
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
     * Create backfill timestamps for old documents
     */

    /**
     * Create a promote client from a user document
     * @param document - User document with mobile and tgId
     * @param targetClientId - Client ID to assign the promote client to
     * @param availableDate - Optional availableDate (defaults to today for immediate availability)
     * @returns true if created successfully, false otherwise
     */
    private async createPromoteClientFromUser(
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
                this.logger.debug(`Failed to Update as PromoteClient as ${document.mobile} already has Password`);
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }

            // Setup 2FA
            await telegramClient.removeOtherAuths();
            await sleep(10000 + Math.random() * 10000);
            await telegramClient.set2fa();
            this.logger.debug('Waiting for setting 2FA');
            await sleep(30000 + Math.random() * 30000);
            
            // Get channel info
            const channels = await channelInfo(telegramClient.client, true);
            await sleep(5000 + Math.random() * 5000);
            
            // Use provided availableDate or default to today
            const targetAvailableDate = availableDate || ClientHelperUtils.getTodayDateString();
            this.logger.debug(`Inserting Document for client ${targetClientId} with availableDate ${targetAvailableDate}`);
            
            const promoteClient: CreatePromoteClientDto = {
                tgId: document.tgId,
                lastActive: 'today',
                mobile: document.mobile,
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: 'Account successfully configured as promote client',
                lastUsed: null,
            };
            
            await this.create(promoteClient);
            await this.updateUser2FAStatus(document.tgId, document.mobile);
            this.logger.log(`Created PromoteClient for ${targetClientId} with availability ${targetAvailableDate}`);
            return true;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error processing client', document.mobile);
            this.logger.error(`Error processing promote client ${document.mobile}: ${errorDetails.message}`);
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
     * Backfill missing timestamp fields for clients that have been used
     */
    private async backfillTimestamps(mobile: string, doc: PromoteClient, now: number): Promise<void> {
        const needsBackfill = !doc.privacyUpdatedAt || !doc.profilePicsDeletedAt ||
            !doc.nameBioUpdatedAt || !doc.usernameUpdatedAt ||
            !doc.profilePicsUpdatedAt;

        if (!needsBackfill) return;

        this.logger.log(`Backfilling timestamp fields for ${mobile}`);

        const allTimestamps = ClientHelperUtils.createBackfillTimestamps(now, this.ONE_DAY_MS);
        const backfillData: UpdatePromoteClientDto = {};

        if (!doc.privacyUpdatedAt) backfillData.privacyUpdatedAt = allTimestamps.privacyUpdatedAt;
        if (!doc.profilePicsDeletedAt) backfillData.profilePicsDeletedAt = allTimestamps.profilePicsDeletedAt;
        if (!doc.nameBioUpdatedAt) backfillData.nameBioUpdatedAt = allTimestamps.nameBioUpdatedAt;
        if (!doc.usernameUpdatedAt) backfillData.usernameUpdatedAt = allTimestamps.usernameUpdatedAt;
        if (!doc.profilePicsUpdatedAt) backfillData.profilePicsUpdatedAt = allTimestamps.profilePicsUpdatedAt;

        await this.update(mobile, backfillData);
        this.logger.log(`Backfilled ${Object.keys(backfillData).length} timestamp fields for ${mobile}`);
    }

    /**
     * Perform health check on a promote client
     * Verifies account is still alive and updates lastChecked
     * @param mobile - Client mobile number
     * @param lastChecked - Timestamp of last health check (0 if never checked)
     * @param now - Current timestamp
     * @returns true if health check passed, false otherwise
     */
    private async performHealthCheck(mobile: string, lastChecked: number, now: number): Promise<boolean> {
        const needsHealthCheck = !lastChecked || (now - lastChecked > 7 * this.ONE_DAY_MS);

        if (!needsHealthCheck) {
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
            this.logger.debug(`Health check passed for ${mobile}`);
            return true;
        } catch (error) {
            const errorDetails = this.handleError(error, 'Health check failed', mobile);
            this.logger.warn(`Health check failed for ${mobile}: ${errorDetails.message}`);
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(mobile, `Health check failed: ${errorDetails.message}`);
            }
            return false;
        } finally {
            await connectionManager.unregisterClient(mobile);
        }
    }
    /**
     * Check which updates are pending for a promote client
     */
    private getPendingUpdates(doc: PromoteClient, now: number): {
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

        // Privacy update - accounts 1-30 days old, not updated in last 15 days
        const privacyTimestamp = ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt);
        const needsPrivacy = accountAge >= DAY && accountAge <= 30 * DAY &&
            (privacyTimestamp === 0 || privacyTimestamp < now - 15 * DAY);
        if (needsPrivacy) reasons.push('Privacy update needed');

        // Delete photos - needs privacy done at least 1 day ago
        const privacyDone = privacyTimestamp > 0 && (now - privacyTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const photosDeletedTimestamp = ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt);
        const needsDeletePhotos = accountAge >= 2 * DAY && accountAge <= 30 * DAY &&
            (photosDeletedTimestamp === 0 || photosDeletedTimestamp < now - 30 * DAY) &&
            (privacyDone || privacyTimestamp === 0);
        if (needsDeletePhotos) reasons.push('Delete photos needed');

        // Name/Bio - needs photos deleted at least 1 day ago, 100+ channels
        const photosDone = photosDeletedTimestamp > 0 && (now - photosDeletedTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const nameBioTimestamp = ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt);
        const needsNameBio = accountAge >= 3 * DAY && accountAge <= 30 * DAY &&
            (doc.channels || 0) > 100 &&
            (nameBioTimestamp === 0 || nameBioTimestamp < now - 30 * DAY) &&
            (photosDone || photosDeletedTimestamp === 0);
        if (needsNameBio) reasons.push('Name/Bio update needed');

        // Username - needs name/bio done at least 1 day ago, 150+ channels
        const nameBioDone = nameBioTimestamp > 0 && (now - nameBioTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const usernameTimestamp = ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt);
        const needsUsername = accountAge >= 7 * DAY && accountAge <= 30 * DAY &&
            (doc.channels || 0) > 150 &&
            (usernameTimestamp === 0 || usernameTimestamp < now - 30 * DAY) &&
            (nameBioDone || nameBioTimestamp === 0);
        if (needsUsername) reasons.push('Username update needed');

        // Profile photos - needs username done at least 1 day ago, 170+ channels
        const usernameDone = usernameTimestamp > 0 && (now - usernameTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const profilePicsTimestamp = ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt);
        const needsProfilePhotos = accountAge >= 10 * DAY && accountAge <= 30 * DAY &&
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
     * Update privacy settings for a promote client
     */
    private async updatePrivacySettings(doc: PromoteClient, client: Client, failedAttempts: number): Promise<number> {
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
     * Delete profile photos for a promote client
     */
    private async deleteProfilePhotos(doc: PromoteClient, client: Client, failedAttempts: number): Promise<number> {
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
     * Update name and bio for a promote client
     */
    private async updateNameAndBio(doc: PromoteClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            const me = await telegramClient.getMe();
            await sleep(5000 + Math.random() * 5000);

            let updateCount = 0;
            const expectedName = client?.name.split(' ')[0];
            if (!isIncludedWithTolerance(safeAttemptReverse(me?.firstName), expectedName, 2)) {
                this.logger.log(`Updating first name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                await telegramClient.updateProfile(
                    `${obfuscateText(`${expectedName} ${getRandomPetName()}`, {
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
     * Update username for a promote client
     */
    private async updateUsername(doc: PromoteClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            await this.telegramService.updateUsername(doc.mobile, '');
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
     * Update profile photos for a promote client
     */
    private async updateProfilePhotos(doc: PromoteClient, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await sleep(5000 + Math.random() * 5000);
            const photos = await telegramClient.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));

            let updateCount = 0;
            if (photos.photos.length < 2) {
                await CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                await sleep(10000 + Math.random() * 5000);

                // CRITICAL: Only add ONE photo per cycle to avoid triggering anti-bot
                const shuffle = <T>(arr: T[]): T[] => {
                    const a = arr.slice();
                    for (let i = a.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [a[i], a[j]] = [a[j], a[i]];
                    }
                    return a;
                };

                const photoPaths = shuffle(['dp1.jpg', 'dp2.jpg', 'dp3.jpg']);
                const randomPhoto = photoPaths[0]; // Only use first photo
                await telegramClient.updateProfilePic(path.join(process.cwd(), randomPhoto));
                updateCount = 1;
                this.logger.debug(`Updated profile photo ${randomPhoto} for ${doc.mobile} (1 of ${photoPaths.length} photos)`);
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

    async processPromoteClient(doc: PromoteClient, client: Client): Promise<number> {
        if (!client) {
            this.logger.warn(`Client not found for promote client ${doc.mobile}`);
            return 0;
        }

        const MIN_COOLDOWN_HOURS = 2;
        const MAX_FAILED_ATTEMPTS = 3; // Skip after 3 consecutive failures
        const FAILURE_RESET_DAYS = 7; // Reset failure count after 7 days
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

            // Check if recently used (skip if has updates)
            const lastUsed = ClientHelperUtils.getTimestamp(doc.lastUsed);
            const hasAnyUpdate = !!(doc.privacyUpdatedAt || doc.profilePicsDeletedAt || doc.nameBioUpdatedAt ||
                doc.usernameUpdatedAt || doc.profilePicsUpdatedAt);
            if (hasAnyUpdate && lastUsed > 0 && now - lastUsed < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                this.logger.debug(`Client ${doc.mobile} recently used, skipping`);
                return 0;
            }

            // Skip accounts older than 30 days
            const accountAge = doc.createdAt ? now - new Date(doc.createdAt).getTime() : 0;
            if (accountAge > 30 * this.ONE_DAY_MS) {
                this.logger.debug(`Client ${doc.mobile} is older than 30 days, skipping`);
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

            // If no updates were performed, still track the attempt to prevent rapid retries
            if (updateCount === 0) {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdatePromoteClientDto);
                // Log why no updates were performed
                if (pendingUpdates.totalPending > 0) {
                    this.logger.debug(`No updates performed for ${doc.mobile} despite ${pendingUpdates.totalPending} pending updates. Reasons: ${pendingUpdates.reasons.join(', ')}`);
                }
            } else {
                // Log remaining pending updates after this update
                const remainingPending = pendingUpdates.totalPending - updateCount;
                if (remainingPending > 0) {
                    this.logger.debug(`Client ${doc.mobile} still has ${remainingPending} pending updates remaining`);
                } else {
                    this.logger.log(`✅ Client ${doc.mobile} - ALL UPDATES COMPLETE! Ready for use.`);
                }
            }

            return updateCount; // Return number of updates performed
        } catch (error: any) {
            const errorDetails = this.handleError(error, 'Error with client', doc.mobile);
            // Track attempt even on error
            try {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdatePromoteClientDto);
            } catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
            if (isPermanentError(errorDetails)) {
                await this.markAsInactive(doc.mobile, `${errorDetails.message}`);
            }
            return 0; // Return 0 on error
        } finally {
            await sleep(15000 + Math.random() * 10000); // 15-25s final delay (increased)
        }
    }

    async checkPromoteClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check promote channels as active client setup exists');
            return;
        }
        this.logger.log('Starting promote client check process');

        const clients = await this.clientService.findAll();
        const bufferClients = await this.bufferClientService.findAll();

        const clientMainMobiles = clients.map((c) => c.mobile);
        const bufferClientIds = bufferClients.map((c) => c.mobile);
        const assignedPromoteMobiles = await this.promoteClientModel
            .find({ clientId: { $exists: true }, status: 'active' })
            .distinct('mobile');

        const goodIds = [...clientMainMobiles, ...bufferClientIds, ...assignedPromoteMobiles].filter(Boolean);

        const promoteClientCounts = await this.promoteClientModel.aggregate([
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

        const promoteClientsPerClient = new Map<string, number>(
            promoteClientCounts.map((result: { _id: string; count: number }) => [result._id, result.count]),
        );

        let totalUpdates = 0;
        const MIN_COOLDOWN_HOURS = 4; // Same cooldown as in processPromoteClient
        const now = Date.now();

        for (const result of promoteClientCounts) {
            // promoteClientsPerClient is already populated from the aggregation above, no need to set again
            if (totalUpdates < 5) {
                for (const promoteClientMobile of result.mobiles) {
                    const promoteClient = await this.findOne(promoteClientMobile, false);
                    if (!promoteClient) {
                        this.logger.warn(`Promote client ${promoteClientMobile} not found, skipping`);
                        continue;
                    }

                    // Check cooldown before processing - handle missing field safely
                    let lastUpdateAttempt = 0;
                    try {
                        lastUpdateAttempt = promoteClient.lastUpdateAttempt
                            ? new Date(promoteClient.lastUpdateAttempt).getTime()
                            : 0;
                    } catch (error) {
                        lastUpdateAttempt = 0;
                    }
                    if (lastUpdateAttempt > 0 && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                        const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                        this.logger.debug(`Skipping ${promoteClientMobile} - on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                        continue;
                    }

                    // Health check: verify client is still alive (check every 7 days)
                    const lastChecked = promoteClient.lastChecked 
                        ? new Date(promoteClient.lastChecked).getTime() 
                        : 0;
                    const healthCheckPassed = await this.performHealthCheck(promoteClientMobile, lastChecked, now);
                    if (!healthCheckPassed) {
                        continue; // Skip to next client if health check failed permanently
                    }

                    // If lastUsed exists, client has been used for promotion and should be fully configured
                    // Backfill missing timestamp fields if needed, then skip (updates were done manually)
                    const hasBeenUsed = promoteClient.lastUsed && new Date(promoteClient.lastUsed).getTime() > 0;
                    if (hasBeenUsed) {
                        const needsBackfill = !promoteClient.privacyUpdatedAt || !promoteClient.profilePicsDeletedAt ||
                            !promoteClient.nameBioUpdatedAt || !promoteClient.usernameUpdatedAt ||
                            !promoteClient.profilePicsUpdatedAt;

                        if (needsBackfill) {
                            await this.backfillTimestamps(promoteClientMobile, promoteClient, now);
                        }

                        // Always skip if lastUsed exists (updates were done manually)
                        this.logger.debug(`Skipping ${promoteClientMobile} - already used, timestamps backfilled`);
                        continue;
                    }

                    // Check if client needs any updates
                    const pendingUpdates = this.getPendingUpdates(promoteClient, now);
                    if (pendingUpdates.totalPending > 0) {
                        const client = clients.find((c) => c.clientId === result._id);
                        if (!client) {
                            this.logger.warn(`Client with ID ${result._id} not found, skipping promote client ${promoteClientMobile}`);
                            continue;
                        }
                        const currentUpdates = await this.processPromoteClient(promoteClient, client);
                        this.logger.debug(`Processed promote client ${promoteClientMobile}, updates made: ${currentUpdates} | total updates so far: ${totalUpdates}`);
                        if (currentUpdates > 0) {
                            totalUpdates += currentUpdates;
                        }
                        this.logger.log(`Processed promote client ${promoteClientMobile}, updates made: ${currentUpdates} | total updates so far: ${totalUpdates}`);
                        if (totalUpdates >= 5) {
                            this.logger.warn('Reached total update limit of 5 for this check cycle');
                            break;
                        }
                    }
                }
            } else {
                this.logger.warn(`Skipping promote client ${result.mobiles.join(', ')} as total updates reached 5`);
            }
        }

        // NEW: Calculate availability-based needs for each client (dynamic, no hard limit)
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
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(client.clientId);

            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingPromoteClients.push({
                    clientId: client.clientId,
                    ...availabilityNeeds
                });
            }
        }

        // Sort by priority (most urgent first: today=0, tomorrow=1, oneWeek=7, tenDays=10, countOnly=100)
        clientNeedingPromoteClients.sort((a, b) => a.priority - b.priority);

        // Calculate total slots needed (rate-limited per trigger, but no per-client limit)
        let totalSlotsNeeded = 0;
        const clientNeedsMap = new Map<string, number>();

        for (const clientNeed of clientNeedingPromoteClients) {
            // No per-client limit check - only global rate limit per trigger
            const allocated = Math.min(
                clientNeed.totalNeeded,
                this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER - totalSlotsNeeded
            );
            if (allocated > 0) {
                clientNeedsMap.set(clientNeed.clientId, allocated);
                totalSlotsNeeded += allocated;
            }
            if (totalSlotsNeeded >= this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) break;
        }

        // Enhanced logging to show availability status
        this.logger.debug(`Availability-based needs calculated (NO HARD LIMIT):`);
        clientNeedingPromoteClients.forEach(need => {
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

        const totalActivePromoteClients = await this.promoteClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active promote clients: ${totalActivePromoteClients}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER} per trigger)`);

        // Build notification message
        const clientNeedsSummary = clientNeedingPromoteClients
            .map(c => `${c.clientId}: ${c.totalNeeded} (${c.calculationReason})`)
            .join('\n');
        
        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Promote Client Check (Dynamic Availability):\n\nTotal Active Promote Clients: ${totalActivePromoteClients}\nPromote Clients Per Client: ${JSON.stringify(Object.fromEntries(promoteClientsPerClient))}\n\nClients Needing Promote Clients:\n${clientNeedsSummary || 'None'}\n\nTotal Slots Needed: ${totalSlotsNeeded}`)}`);

        if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoPromoteClientsDynamic(
                [],
                goodIds,
                clientNeedingPromoteClients,
                promoteClientsPerClient
            );
        } else {
            this.logger.debug('No new promote clients needed - all availability windows and total count satisfied');
        }
    }

    /**
     * Add new users to promote clients pool
     * Legacy method - now uses dynamic availability-based calculation internally
     * Maintains backward compatibility with existing API calls
     * 
     * @param badIds - Mobile numbers to exclude from selection
     * @param goodIds - Mobile numbers already in use (active clients, buffer clients, assigned promote clients)
     * @param clientsNeedingPromoteClients - Array of client IDs that need more promote clients
     * @param promoteClientsPerClient - Optional map of current promote client counts per client
     */
    async addNewUserstoPromoteClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingPromoteClients: string[] = [],
        promoteClientsPerClient?: Map<string, number>,
    ) {
        // Convert legacy format to dynamic format
        const clientNeedingPromoteClientsDynamic: Array<{
            clientId: string;
            totalNeeded: number;
            windowNeeds: Array<{ window: string; available: number; needed: number; targetDate: string; minRequired: number }>;
            totalActive: number;
            totalNeededForCount: number;
            calculationReason: string;
            priority: number;
        }> = [];

        // Calculate needs for each client using dynamic calculation
        for (const clientId of clientsNeedingPromoteClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingPromoteClientsDynamic.push({
                    clientId,
                    ...availabilityNeeds
                });
            }
        }

        // Sort by priority (most urgent first)
        clientNeedingPromoteClientsDynamic.sort((a, b) => a.priority - b.priority);

        // Call dynamic method
        await this.addNewUserstoPromoteClientsDynamic(
            badIds,
            goodIds,
            clientNeedingPromoteClientsDynamic,
            promoteClientsPerClient
        );
    }

    /**
     * Add new users to promote clients pool using dynamic availability-based assignment
     * All new promote clients get availableDate = today (available immediately)
     * Prioritizes by urgency (today > tomorrow > 1 week > 10 days > count only)
     * 
     * @param badIds - Mobile numbers to exclude from selection
     * @param goodIds - Mobile numbers already in use (active clients, buffer clients, assigned promote clients)
     * @param clientsNeedingPromoteClients - Array of client needs with priority and window details
     * @param promoteClientsPerClient - Optional map of current promote client counts per client (for reference)
     */
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
    ) {
        const threeMonthsAgo = ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);

        // Calculate total needed (already sorted by priority)
        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingPromoteClients) {
            totalNeeded += clientNeed.totalNeeded;
        }
        // Only global rate limit applies
        totalNeeded = Math.min(totalNeeded, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER);

        if (totalNeeded === 0) {
            this.logger.debug('No promote clients needed - all availability windows and total count satisfied');
            return;
        }

        this.logger.debug(
            `Creating ${totalNeeded} new promote clients (all with availableDate = today) ` +
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
        const today = ClientHelperUtils.getTodayDateString();
        const assignmentQueue: Array<{
            clientId: string;
            priority: number;
        }> = [];

        for (const clientNeed of clientsNeedingPromoteClients) {
            // Create assignments for each needed promote client
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
                // All new promote clients get availableDate = today
                const created = await this.createPromoteClientFromUser(
                    document,
                    assignment.clientId,
                    today // Always today - they'll be available immediately
                );

                if (created) {
                    assignmentIndex++;
                    processedCount++;
                    this.logger.debug(
                        `Created promote client ${document.mobile} for ${assignment.clientId} ` +
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
            `✅ Dynamic batch completed: Created ${processedCount} new promote clients ` +
            `(all with availableDate = ${today}, available immediately). ` +
            `System maintains availability windows and total count requirements.`
        );
    }

    private clearAllTimeouts(): void {
        this.activeTimeouts.forEach((timeout) => clearTimeout(timeout));
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }

    private async cleanup(): Promise<void> {
        try {
            this.clearAllTimeouts();
            this.clearMemoryCleanup();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            this.clearPromoteMap();
            this.clearLeaveMap();
            this.isJoinChannelProcessing = false;
            this.isLeaveChannelProcessing = false;
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }

    async onModuleDestroy() {
        await this.cleanup();
    }

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
            totalPromoteClients,
            unassignedPromoteClients,
            activePromoteClients,
            inactivePromoteClients,
            assignedCounts,
            activeCounts,
            inactiveCounts,
            neverUsedCounts,
            recentlyUsedCounts,
        ] = await Promise.all([
            this.promoteClientModel.countDocuments({}),
            this.promoteClientModel.countDocuments({ clientId: { $exists: false } }),
            this.promoteClientModel.countDocuments({ status: 'active' }),
            this.promoteClientModel.countDocuments({ status: 'inactive' }),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
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

        const distributionPerClient: Array<{
            clientId: string;
            assignedCount: number;
            activeCount: number;
            inactiveCount: number;
            needed: number;
            status: 'sufficient' | 'needs_more';
            neverUsed: number;
            usedInLast24Hours: number;
        }> = [];
        let clientsWithSufficient = 0;
        let clientsNeedingMore = 0;
        let totalNeeded = 0;

        for (const client of clients) {
            const assignedCount = assignedCountMap.get(client.clientId) || 0;
            const activeCount = activeCountMap.get(client.clientId) || 0;
            const inactiveCount = inactiveCountMap.get(client.clientId) || 0;
            const neverUsed = neverUsedCountMap.get(client.clientId) || 0;
            const usedInLast24Hours = recentlyUsedCountMap.get(client.clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - activeCount);
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

        const maxPerTrigger = this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER;
        const triggersNeeded = Math.ceil(totalNeeded / maxPerTrigger);

        return {
            totalPromoteClients,
            unassignedPromoteClients,
            activePromoteClients,
            inactivePromoteClients,
            distributionPerClient,
            summary: {
                clientsWithSufficientPromoteClients: clientsWithSufficient,
                clientsNeedingPromoteClients: clientsNeedingMore,
                totalPromoteClientsNeeded: totalNeeded,
                maxPromoteClientsPerTrigger: maxPerTrigger,
                triggersNeededToSatisfyAll: triggersNeeded,
            },
        };
    }

    async getPromoteClientsByStatus(status: string): Promise<PromoteClient[]> {
        return this.promoteClientModel.find({ status }).exec();
    }

    async getPromoteClientsWithMessages(): Promise<
        Array<{
            mobile: string;
            status: string;
            message: string;
            clientId?: string;
            lastUsed?: Date;
        }>
    > {
        return this.promoteClientModel
            .find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 })
            .exec();
    }

    async getLeastRecentlyUsedPromoteClients(clientId: string, limit: number = 1): Promise<PromoteClient[]> {
        // Note: PromoteClient schema doesn't have 'inUse' field, so we only filter by status
        return this.promoteClientModel
            .find({ clientId, status: 'active' })
            .sort({ lastUsed: 1, _id: 1 })
            .limit(limit)
            .exec();
    }

    async getNextAvailablePromoteClient(clientId: string): Promise<PromoteClient | null> {
        const clients = await this.getLeastRecentlyUsedPromoteClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }

    async getUnusedPromoteClients(hoursAgo: number = 24, clientId?: string): Promise<PromoteClient[]> {
        const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const filter: Record<string, any> = {
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

        return this.promoteClientModel.find(filter).exec();
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
            this.promoteClientModel.countDocuments(filter),
            this.promoteClientModel.countDocuments({
                ...filter,
                $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
            }),
            this.promoteClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: last24Hours },
            }),
            this.promoteClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: lastWeek },
            }),
            this.promoteClientModel.find(filter, { lastUsed: 1, createdAt: 1 }).exec(),
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

    private createTimeout(callback: () => void, delay: number): NodeJS.Timeout {
        const timeout = setTimeout(() => {
            this.activeTimeouts.delete(timeout);
            callback();
        }, delay);
        this.activeTimeouts.add(timeout);
        return timeout;
    }
}