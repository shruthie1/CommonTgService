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
        return newUser.save();
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

    async updateStatus(mobile: string, status: string, message?: string): Promise<PromoteClient> {
        const updateData: any = { status };
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
        const updateData: any = { lastUsed: new Date() };
        if (message) {
            updateData.message = message;
        }
        return this.update(mobile, updateData);
    }

    async markAsInactive(mobile: string, reason: string): Promise<PromoteClient> {
        return this.updateStatus(mobile, 'inactive', reason);
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

    async search(filter: any): Promise<PromoteClient[]> {
        this.logger.debug(`Search filter:`, filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        this.logger.debug(`Modified filter:`, filter);
        return this.promoteClientModel.find(filter).exec();
    }

    async executeQuery(
        query: any,
        sort?: any,
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
            .find({ status: 'active' })
            .sort({ channels: 1 });

        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client?.mobile;
            this.logger.info(`Processing PromoteClient (${i + 1}/${clients.length}): ${mobile}`);
            try {
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
                this.logger.debug(`[${mobile}]: Found ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });
            } catch (error) {
                const errorDetails = parseError(error, `[PromoteClientService] Error Updating Info for ${mobile}: `);
                if (isPermanentError(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
                this.logger.error(`[${mobile}] Error updating info for client`, errorDetails);
            } finally {
                await connectionManager.unregisterClient(mobile);
                // Increased delay to avoid rate limits
                if (i < clients.length - 1) {
                    await sleep(12000 + Math.random() * 8000); // 12-20 seconds between each client
                }
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
                if (!activeChannel || activeChannel.banned || (activeChannel as any).deleted) { // Assume 'deleted' field; adjust schema if needed
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
        } catch (unregisterError) {
            this.logger.warn(`Error during client cleanup for ${mobile}:`, unregisterError);
        }
    }

    async setAsPromoteClient(
        mobile: string,
        availableDate: string = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
     * Check which updates are pending for a promote client
     * Returns information about what needs to be updated
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

    async processPromoteClient(doc: PromoteClient, client: Client): Promise<number> {
        // Validate client parameter
        if (!client) {
            this.logger.warn(`[PromoteClientService] Client not found for promote client ${doc.mobile}`);
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
                this.logger.debug(`[PromoteClientService] Client ${doc.mobile} on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                return 0;
            }
            
            // Also check lastUsed for additional safety
            if (lastUsed && now - lastUsed < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                this.logger.debug(`[PromoteClientService] Client ${doc.mobile} recently used, skipping to avoid rate limits`);
                return 0;
            }

            // Check pending updates and log them
            const pendingUpdates = this.getPendingUpdates(doc, now);
            if (pendingUpdates.totalPending > 0) {
                this.logger.debug(`[PromoteClientService] Client ${doc.mobile} has ${pendingUpdates.totalPending} pending updates: ${pendingUpdates.reasons.join(', ')}`);
            } else {
                this.logger.debug(`[PromoteClientService] Client ${doc.mobile} has no pending updates - all updates complete!`);
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
                    } as UpdatePromoteClientDto);
                    updateCount++;
                    this.logger.debug(`[PromoteClientService] Updated privacy settings for ${doc.mobile}`);
                    await sleep(30000 + Math.random() * 20000); // 30-50s delay after operation
                    return updateCount; // Exit after one update
                } catch (error: any) {
                    const errorDetails = parseError(error, `Error in Updating Privacy: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdatePromoteClientDto); // Track attempt even on failure
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
                        } as UpdatePromoteClientDto);
                        updateCount++;
                        this.logger.debug(`[PromoteClientService] Deleted profile photos for ${doc.mobile}`);
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
                const expectedName = client?.name.split(' ')[0];
                if (!isIncludedWithTolerance(safeAttemptReverse(me?.firstName), expectedName, 2)) {
                    try {
                        this.logger.log(`[PromoteClientService] Updating first name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                        await cli.updateProfile(
                            `${obfuscateText(`${expectedName} ${getRandomPetName()}`, {
                                maintainFormatting: false,
                                preserveCase: true,
                                useInvisibleChars: false
                            })} ${getCuteEmoji()}`,
                            ''
                        );
                        await this.update(doc.mobile, { 
                            nameBioUpdatedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        } as UpdatePromoteClientDto);
                        updateCount++;
                        this.logger.debug(`[PromoteClientService] Updated name and bio for ${doc.mobile}`);
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
                    await this.telegramService.updateUsername(doc.mobile, '');
                    await this.update(doc.mobile, { 
                        usernameUpdatedAt: new Date(),
                        lastUpdateAttempt: new Date()
                    } as UpdatePromoteClientDto);
                    updateCount++;
                    this.logger.debug(`[PromoteClientService] Updated username for ${doc.mobile}`);
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
                        await cli.updateProfilePic(path.join(rootPath, randomPhoto));
                        await this.update(doc.mobile, { 
                            profilePicsUpdatedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        } as UpdatePromoteClientDto);
                        updateCount++;
                        this.logger.debug(`[PromoteClientService] Updated profile photo ${randomPhoto} for ${doc.mobile} (1 of ${photoPaths.length} photos)`);
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
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() } as UpdatePromoteClientDto);
                // Log why no updates were performed
                if (pendingUpdates.totalPending > 0) {
                    this.logger.debug(`[PromoteClientService] No updates performed for ${doc.mobile} despite ${pendingUpdates.totalPending} pending updates. Reasons: ${pendingUpdates.reasons.join(', ')}`);
                }
            } else {
                // Log remaining pending updates after this update
                const remainingPending = pendingUpdates.totalPending - updateCount;
                if (remainingPending > 0) {
                    this.logger.debug(`[PromoteClientService] Client ${doc.mobile} still has ${remainingPending} pending updates remaining`);
                } else {
                    this.logger.log(`[PromoteClientService] ✅ Client ${doc.mobile} - ALL UPDATES COMPLETE! Ready for use.`);
                }
            }
            
            return updateCount; // Return number of updates performed
        } catch (error: any) {
            const errorDetails = parseError(error, `Error with client ${doc.mobile}`);
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
            try {
                if (cli) await connectionManager.unregisterClient(doc.mobile);
            } catch (unregisterError: any) {
                this.logger.error(`[PromoteClientService] Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
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
            promoteClientCounts.map((result: any) => [result._id, result.count]),
        );

        const clientNeedingPromoteClients: string[] = [];
        let totalSlotsNeeded = 0;

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
                    
                    // Check cooldown before processing
                    const lastUpdateAttempt = (promoteClient as any).lastUpdateAttempt 
                        ? new Date((promoteClient as any).lastUpdateAttempt).getTime() 
                        : 0;
                    if (lastUpdateAttempt && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                        const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                        this.logger.debug(`Skipping ${promoteClientMobile} - on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                        continue;
                    }
                    
                    // Only process if not recently used
                    if (!promoteClient.lastUsed) {
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

        for (const client of clients) {
            const assignedCount = promoteClientsPerClient.get(client.clientId) || 0;
            // No need to set it again, it's already in the map from the aggregation

            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount);
            if (needed > 0) {
                clientNeedingPromoteClients.push(client.clientId);
            }
        }

        // Sort for fairness (round-robin by clientId)
        clientNeedingPromoteClients.sort();

        // Calculate total slots needed with rate limiting
        for (const clientId of clientNeedingPromoteClients) {
            if (totalSlotsNeeded >= this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) break;

            const assignedCount = promoteClientsPerClient.get(clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount);
            const allocatedForThisClient = Math.min(
                needed,
                this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER - totalSlotsNeeded,
            );
            totalSlotsNeeded += allocatedForThisClient;
        }

        this.logger.debug(`Promote clients per client: ${JSON.stringify(Object.fromEntries(promoteClientsPerClient))}`);
        this.logger.debug(`Clients needing promote clients: ${clientNeedingPromoteClients.join(', ')}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER} per trigger)`);

        const totalActivePromoteClients = await this.promoteClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active promote clients: ${totalActivePromoteClients}`);

        await fetchWithTimeout(
            `${notifbot()}&text=${encodeURIComponent(`Promote Client Check:\n\nTotal Active Promote Clients: ${totalActivePromoteClients}\nPromote Clients Per Client: ${JSON.stringify(Object.fromEntries(promoteClientsPerClient))}\nClients Needing Promote Clients: ${clientNeedingPromoteClients.join(', ')}\nTotal Slots Needed: ${totalSlotsNeeded}`)}`,
        );

        if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoPromoteClients([], goodIds, clientNeedingPromoteClients, promoteClientsPerClient);
        } else {
            this.logger.debug('No new promote clients needed');
        }
    }

    async addNewUserstoPromoteClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingPromoteClients: string[] = [],
        promoteClientsPerClient?: Map<string, number>,
    ) {
        const sixMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        let totalNeededFromClients = 0;

        for (const clientId of clientsNeedingPromoteClients) {
            let currentCount = promoteClientsPerClient?.get(clientId) || 0;
            if (!promoteClientsPerClient) {
                currentCount = await this.promoteClientModel.countDocuments({ clientId, status: 'active' });
            }
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            totalNeededFromClients += needed;
        }

        const totalNeeded = Math.min(totalNeededFromClients, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER);

        if (totalNeeded === 0) {
            this.logger.debug('No promote clients needed');
            return;
        }

        this.logger.debug(`Creating ${totalNeeded} new promote clients (max ${this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER} per trigger)`);

        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: sixMonthsAgo },
                totalChats: { $gt: 150 },
            },
            { tgId: 1 },
            totalNeeded + 5, // Extra for failures
        );

        this.logger.debug(`Found ${documents.length} candidate documents`);

        let processedCount = 0;
        const clientAssignmentTracker = new Map<string, number>();

        // Initialize tracker
        for (const clientId of clientsNeedingPromoteClients) {
            let currentCount = promoteClientsPerClient?.get(clientId) || 0;
            if (!promoteClientsPerClient) {
                currentCount = await this.promoteClientModel.countDocuments({ clientId, status: 'active' });
            }
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            clientAssignmentTracker.set(clientId, needed);
        }

        while (
            processedCount < Math.min(totalNeeded, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) &&
            documents.length > 0 &&
            clientsNeedingPromoteClients.length > 0
        ) {
            const document = documents.shift();
            if (!document?.mobile || !document.tgId) {
                this.logger.warn('Invalid document, skipping');
                continue;
            }

            // Pre-check if already a promote client
            const existingPromote = await this.findOne(document.mobile, false);
            if (existingPromote) {
                this.logger.debug(`Skipping ${document.mobile}: already a promote client`);
                continue;
            }

            let targetClientId: string | null = null;
            for (const clientId of clientsNeedingPromoteClients) {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                if (needed > 0) {
                    targetClientId = clientId;
                    break;
                }
            }

            if (!targetClientId) {
                this.logger.debug('All clients satisfied');
                break;
            }

            try {
                const client = await connectionManager.getClient(document.mobile, { autoDisconnect: false });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);

                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await sleep(10000 + Math.random() * 10000); // 10-20s delay
                        await client.set2fa();
                        await sleep(30000 + Math.random() * 30000); // 30-60s delay for 2FA setup

                        const channels = await channelInfo(client.client, true);
                        await sleep(5000 + Math.random() * 5000); // Delay before creating promote client record
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: 'today',
                            mobile: document.mobile,
                            availableDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            clientId: targetClientId,
                            status: 'active',
                            message: 'Account successfully configured as promote client',
                            lastUsed: null,
                        };
                        await this.create(promoteClient);

                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA for ${document.mobile}:`, userUpdateError);
                        }

                        this.logger.log(`Created PromoteClient for ${targetClientId}: ${document.mobile}`);
                        
                        // Only update tracker if we actually created a promote client
                        const currentNeeded = clientAssignmentTracker.get(targetClientId) || 0;
                        const newNeeded = Math.max(0, currentNeeded - 1);
                        clientAssignmentTracker.set(targetClientId, newNeeded);

                        if (newNeeded === 0) {
                            const index = clientsNeedingPromoteClients.indexOf(targetClientId);
                            if (index > -1) {
                                clientsNeedingPromoteClients.splice(index, 1);
                            }
                        }

                        this.logger.debug(`Client ${targetClientId}: ${newNeeded} more needed`);
                        processedCount++;
                    } else {
                        this.logger.debug(`${document.mobile} already has password`);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA for ${document.mobile}:`, userUpdateError);
                        }
                        // Don't update tracker or increment processedCount if we didn't create a promote client
                    }
                } catch (error: any) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`, error);
                    const errorDetails = parseError(error);
                    if (isPermanentError(errorDetails)) {
                        try {
                            await this.markAsInactive(document.mobile, errorDetails.message);
                        } catch (markError) {
                            this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                        }
                    }
                    processedCount++; // Prevent infinite loop
                } finally {
                    await this.safeUnregisterClient(document.mobile);
                    // Add delay between client processing even on errors
                    await sleep(10000 + Math.random() * 5000);
                }
            } catch (error: any) {
                this.logger.error(`Error creating connection for ${document.mobile}: ${error.message}`, error);
                const errorDetails = parseError(error);
                if (isPermanentError(errorDetails)) {
                    try {
                        await this.markAsInactive(document.mobile, errorDetails.message);
                    } catch (markError) {
                        this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                    }
                }
                // Add delay even on error to prevent rapid retries
                await sleep(10000 + Math.random() * 5000);
            }
        }

        this.logger.log(`Batch completed: Created ${processedCount} new promote clients`);
        if (clientsNeedingPromoteClients.length > 0) {
            const stillNeeded = clientsNeedingPromoteClients
                .map((clientId) => `${clientId}:${clientAssignmentTracker.get(clientId) || 0}`)
                .join(', ');
            this.logger.log(`Still needed: ${stillNeeded}`);
        } else {
            this.logger.log('All clients have sufficient promote clients!');
        }
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
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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

        const assignedCountMap = new Map(assignedCounts.map((item: any) => [item._id, item.count]));
        const activeCountMap = new Map(activeCounts.map((item: any) => [item._id, item.count]));
        const inactiveCountMap = new Map(inactiveCounts.map((item: any) => [item._id, item.count]));
        const neverUsedCountMap = new Map(neverUsedCounts.map((item: any) => [item._id, item.count]));
        const recentlyUsedCountMap = new Map(recentlyUsedCounts.map((item: any) => [item._id, item.count]));

        const distributionPerClient: any[] = [];
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

        return this.promoteClientModel.find(filter).exec();
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