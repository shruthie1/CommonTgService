import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import {
    BadRequestException,
    ConflictException,
    HttpException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
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
import { connectionManager } from '../Telegram/utils/connection-manager'
import { SessionService } from '../session-manager';
import { contains } from '../../utils';
import { ActiveChannel } from '../active-channels';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
@Injectable()
export class PromoteClientService implements OnModuleDestroy {
    private readonly logger = new Logger(PromoteClientService.name);
    private joinChannelMap: Map<string, Channel[] | ActiveChannel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout | null = null;
    private leaveChannelMap: Map<string, string[]> = new Map();
    private leaveChannelIntervalId: NodeJS.Timeout | null = null;
    private isLeaveChannelProcessing: boolean = false;
    private isJoinChannelProcessing: boolean = false;
    private activeTimeouts: Set<NodeJS.Timeout> = new Set();
    private readonly JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000; // 4 minutes - increased for CPU performance
    private readonly LEAVE_CHANNEL_INTERVAL = 60 * 1000; // 1 minute - increased for CPU performance
    private readonly LEAVE_CHANNEL_BATCH_SIZE = 10;
    private readonly MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER = 10; // Rate limiting constant
    private readonly MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT = 12; // Max promote clients per client
    private readonly MAX_MAP_SIZE = 100; // Prevent unbounded Map growth
    private readonly CHANNEL_PROCESSING_DELAY = 10000; // 10 seconds between channel operations
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
    ) { }

    private checkMemoryHealth(): void {
        const memoryStats = {
            joinMapSize: this.joinChannelMap.size,
            leaveMapSize: this.leaveChannelMap.size,
            activeTimeouts: this.activeTimeouts.size,
            isJoinProcessing: this.isJoinChannelProcessing,
            isLeaveProcessing: this.isLeaveChannelProcessing,
        };

        this.logger.debug('Memory health check:', memoryStats);

        // Emergency cleanup if memory usage is too high
        if (memoryStats.joinMapSize > this.MAX_MAP_SIZE * 0.9) {
            this.logger.warn(
                'Join map approaching memory limit, performing emergency cleanup',
            );
            this.performMemoryCleanup();
        }

        if (memoryStats.leaveMapSize > this.MAX_MAP_SIZE * 0.9) {
            this.logger.warn(
                'Leave map approaching memory limit, performing emergency cleanup',
            );
            this.performMemoryCleanup();
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
                    console.log(
                        `Cleaning up joinChannelMap entry for mobile: ${mobile} as channels : ${channels}`,
                    );
                    this.joinChannelMap.delete(mobile);
                }
            }

            // Clean up empty entries in leaveChannelMap
            for (const [mobile, channels] of this.leaveChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    console.log(
                        `Cleaning up leaveChannelMap entry for mobile: ${mobile} as channels : ${channels}`,
                    );
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
    async create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient> {
        // Set default values if not provided
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

    async findOne(
        mobile: string,
        throwErr: boolean = true,
    ): Promise<PromoteClient> {
        const user = (
            await this.promoteClientModel.findOne({ mobile }).exec()
        )?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(
                `PromoteClient with mobile ${mobile} not found`,
            );
        }
        return user;
    }

    async update(
        mobile: string,
        updateClientDto: UpdatePromoteClientDto,
    ): Promise<PromoteClient> {
        const updatedUser = await this.promoteClientModel
            .findOneAndUpdate(
                { mobile },
                { $set: updateClientDto },
                { new: true, returnDocument: 'after' },
            )
            .exec();

        if (!updatedUser) {
            throw new NotFoundException(`User with mobile ${mobile} not found`);
        }

        return updatedUser;
    }

    async updateStatus(
        mobile: string,
        status: string,
        message?: string,
    ): Promise<PromoteClient> {
        const updateData: any = { status };
        if (message) {
            updateData.message = message;
        }

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

    async markAsActive(
        mobile: string,
        message: string = 'Account is functioning properly',
    ): Promise<PromoteClient> {
        return this.updateStatus(mobile, 'active', message);
    }

    async createOrUpdate(
        mobile: string,
        createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto,
    ): Promise<PromoteClient> {
        const existingUser = (
            await this.promoteClientModel.findOne({ mobile }).exec()
        )?.toJSON();
        if (existingUser) {
            this.logger.debug('Updating existing promote client');
            return this.update(
                existingUser.mobile,
                createOrUpdateUserDto as UpdatePromoteClientDto,
            );
        } else {
            this.logger.debug('Creating new promote client');
            return this.create(createOrUpdateUserDto as CreatePromoteClientDto);
        }
    }

    async remove(mobile: string, message?: string): Promise<void> {
        try {
            this.logger.log(`Removing PromoteClient with mobile: ${mobile}`);

            const deleteResult = await this.promoteClientModel
                .deleteOne({ mobile })
                .exec();

            if (deleteResult.deletedCount === 0) {
                throw new NotFoundException(
                    `PromoteClient with mobile ${mobile} not found`,
                );
            }

            await fetchWithTimeout(
                `${notifbot()}&text=${encodeURIComponent(`${process.env.serviceName || process.env.clientId} Deleting Promote Client : ${mobile}\n${message}`)}`,
            );
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            const errorDetails = parseError(error);
            this.logger.error(
                `Error removing PromoteClient with mobile ${mobile}: ${errorDetails.message}`,
            );
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`PromoteClient with mobile ${mobile} removed successfully`);
    }
    async search(filter: any): Promise<PromoteClient[]> {
        this.logger.debug(`Search filter: ${JSON.stringify(filter)}`);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        this.logger.debug(`Modified filter: ${JSON.stringify(filter)}`);
        return this.promoteClientModel.find(filter).exec();
    }

    async executeQuery(
        query: any,
        sort?: any,
        limit?: number,
        skip?: number,
    ): Promise<PromoteClient[]> {
        try {
            if (!query) {
                throw new BadRequestException('Query is invalid.');
            }
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
            throw new InternalServerErrorException(error.message);
        }
    }

    removeFromPromoteMap(key: string) {
        const deleted = this.joinChannelMap.delete(key);
        if (deleted) {
            this.logger.debug(`Removed ${key} from join channel map`);
        }
    }

    /**
     * Enhanced cleanup method that handles all memory leaks
     */
    clearPromoteMap() {
        this.logger.debug('PromoteMap cleared');
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }

    async updateInfo() {
        const clients = await this.promoteClientModel
            .find({
                status: 'active',
            })
            .sort({ channels: 1 });

        for (let i = 0; i < clients.length; i++) {
            console.log(`Processing PromoteClient (${i}/${clients.length})`)
            const client = clients[i]
            const mobile = client?.mobile;
            try {
                this.logger.debug(`Updating info for client: ${mobile}`);
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
                const errorDetails = parseError(error, `[PromoteClientService] Error Updating Info for ${mobile}: `);
                await this.markAsInactive(mobile, `${errorDetails.message}`);
                this.logger.error(
                    `Error updating info for client ${client.mobile}:`,
                    errorDetails,
                );
            } finally {
                await connectionManager.unregisterClient(mobile);
                await sleep(2000);
            }
        }
    }

    async joinchannelForPromoteClients(
        skipExisting: boolean = true,
    ): Promise<string> {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn(
                'Active client setup exists, skipping promotion process',
            );
            return 'Active client setup exists, skipping promotion';
        }

        this.logger.log('Starting join channel process');
        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();

        // Longer initial delay to reduce CPU spike
        await sleep(3000);

        try {
            const existingKeys = skipExisting
                ? []
                : Array.from(this.joinChannelMap.keys());

            // Reduced limit for sequential processing
            const clients = await this.promoteClientModel
                .find({
                    channels: { $lt: 350 },
                    mobile: { $nin: existingKeys },
                    status: 'active',
                })
                .sort({ channels: 1 })
                .limit(16);

            this.logger.debug(
                `Found ${clients.length} clients to process for joining channels`,
            );

            const joinSet = new Set<string>();
            const leaveSet = new Set<string>();
            let successCount = 0;
            let failCount = 0;

            // Sequential processing with proper delays
            for (let i = 0; i < clients.length; i++) {
                const document = clients[i];
                const mobile = document.mobile;

                this.logger.debug(
                    `Processing client ${i + 1}/${clients.length}: ${mobile}`,
                );

                try {
                    const client = await connectionManager.getClient(mobile, {
                        autoDisconnect: false,
                        handler: false,
                    });

                    // Add delay before channel info retrieval
                    await sleep(2000);
                    const channels = await channelInfo(client.client, true);
                    this.logger.debug(
                        `${mobile}: Found ${channels.ids.length} existing channels`,
                    );
                    await this.update(mobile, { channels: channels.ids.length });

                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = channels.ids;
                        const channelLimit = 150;

                        // Add delay before channel retrieval
                        await sleep(1500);
                        const result: Channel[] | ActiveChannel[] =
                            channels.ids.length < 220
                                ? await this.channelsService.getActiveChannels(
                                    channelLimit,
                                    0,
                                    excludedIds,
                                )
                                : await this.activeChannelsService.getActiveChannels(
                                    channelLimit,
                                    0,
                                    excludedIds,
                                );

                        if (!this.joinChannelMap.has(mobile)) {
                            this.joinChannelMap.set(mobile, result);
                            joinSet.add(mobile);
                        } else {
                            this.logger.debug(
                                `${mobile}: Already in join queue, skipping re-add`,
                            );
                        }
                        await this.sessionService.getOldestSessionOrCreate({
                            mobile: document.mobile
                        })
                    } else {
                        this.logger.debug(
                            `${mobile}: Too many blocked channels (${channels.canSendFalseCount}), preparing for leave`,
                        );
                        if (!this.leaveChannelMap.has(mobile)) {
                            this.leaveChannelMap.set(mobile, channels.canSendFalseChats);
                            leaveSet.add(mobile);
                        } else {
                            this.logger.debug(
                                `${mobile}: Already in leave queue, skipping re-add`,
                            );
                        }
                    }

                    successCount++;
                } catch (error) {
                    failCount++;
                    const errorDetails = parseError(error);
                    this.logger.error(`Error processing client ${mobile}:`, errorDetails);

                    const errorMsg =
                        error?.errorMessage || errorDetails?.message || 'Unknown error';

                    if (
                        contains(errorDetails.message, [
                            'SESSION_REVOKED',
                            'AUTH_KEY_UNREGISTERED',
                            'USER_DEACTIVATED',
                            'USER_DEACTIVATED_BAN',
                            'FROZEN_METHOD_INVALID',
                        ])
                    ) {
                        this.logger.warn(
                            `${mobile}: Fatal session error (${errorMsg}), marking as inactive and removing`,
                        );
                        try {
                            await this.markAsInactive(mobile, `Session error: ${errorMsg}`);
                            await sleep(1000); // Delay after status update
                        } catch (statusUpdateError) {
                            this.logger.error(
                                `Failed to update status for ${mobile}:`,
                                statusUpdateError,
                            );
                        }

                        await sleep(1000); // Delay before removal
                        await this.remove(mobile, `JoinChannelError: ${errorDetails.message}`);
                    } else {
                        this.logger.warn(
                            `${mobile}: Non-fatal error encountered, will retry later`,
                        );
                    }
                } finally {
                    // Ensure client cleanup with proper delay
                    try {
                        await connectionManager.unregisterClient(mobile);
                    } catch (cleanupError) {
                        this.logger.warn(
                            `Error during client cleanup for ${mobile}:`,
                            cleanupError,
                        );
                    }
                    await sleep(5000);
                }
            }

            // Add delay before starting queues
            await sleep(3000);

            if (joinSet.size > 0) {
                this.startMemoryCleanup();
                this.logger.debug(
                    `Starting join queue for ${joinSet.size} buffer clients`,
                );
                this.createTimeout(() => this.joinChannelQueue(), 2000); // Delayed start
            }

            if (leaveSet.size > 0) {
                this.logger.debug(
                    `Starting leave queue for ${leaveSet.size} buffer clients`,
                );
                this.createTimeout(() => this.leaveChannelQueue(), 5000); // Delayed start
            }

            this.logger.log(
                `Join channel process completed for ${clients.length} clients (Success: ${successCount}, Failed: ${failCount})`,
            );
            return `Initiated Joining channels for ${joinSet.size} | Queued for leave: ${leaveSet.size}`;
        } catch (error) {
            this.logger.error(
                'Unexpected error during joinchannelForPromoteClients:',
                error,
            );
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            throw new Error('Failed to initiate channel joining process');
        }
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
            this.logger.debug(
                'Join channel process already running, skipping interval',
            );
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
        this.logger.debug(
            `Processing join channel queue sequentially for ${keys.length} clients`,
        );

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel: Channel | ActiveChannel | null = null;

            try {
                const channels = this.joinChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(
                        `No more channels to join for ${mobile}, removing from queue`,
                    );
                    this.removeFromPromoteMap(mobile);
                    continue;
                }

                currentChannel = channels.shift();
                this.logger.debug(
                    `${mobile} has ${channels.length} pending channels to join, processing: @${currentChannel.username}`,
                );
                this.joinChannelMap.set(mobile, channels);
                await this.telegramService.tryJoiningChannel(mobile, currentChannel);
            } catch (error: any) {
                const errorDetails = parseError(
                    error,
                    `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `,
                    false,
                );
                this.logger.error(
                    `Error joining channel for ${mobile}: ${error.message}`,
                );

                if (
                    errorDetails.error === 'FloodWaitError' ||
                    error.errorMessage === 'CHANNELS_TOO_MUCH'
                ) {
                    this.logger.warn(
                        `${mobile} has FloodWaitError or joined too many channels, removing from queue`,
                    );
                    this.removeFromPromoteMap(mobile);

                    try {
                        await sleep(2000);
                        const channelsInfo = await this.telegramService.getChannelInfo(
                            mobile,
                            true,
                        );
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    } catch (updateError) {
                        this.logger.error(
                            `Error updating channel count for ${mobile}:`,
                            updateError,
                        );
                    }
                }

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
                    this.removeFromPromoteMap(mobile);
                    try {
                        await this.remove(mobile, `ProcessJoinChannel:${errorDetails.message}`);
                        await sleep(2000);
                    } catch (removeError) {
                        this.logger.error(`Error removing client ${mobile}:`, removeError);
                    }
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

                // Add delay between channel processing operations
                if (
                    i < keys.length - 1 ||
                    this.joinChannelMap.get(mobile)?.length > 0
                ) {
                    console.log(
                        `Sleeping for ${this.CHANNEL_PROCESSING_DELAY} before continuing with next Mobile`,
                    );
                    await sleep(this.CHANNEL_PROCESSING_DELAY);
                } else {
                    console.log(`Not Sleeping before continuing with next Mobile`);
                }
            }
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(
                `Clearing join channel interval: ${this.joinChannelIntervalId}`,
            );
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

        // Start interval if not already running
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
            this.logger.debug(
                'Leave channel process already running, skipping interval',
            );
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
        this.logger.debug(
            `Processing leave channel queue sequentially for ${keys.length} clients`,
        );

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];

            try {
                const channels = this.leaveChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(
                        `No more channels to leave for ${mobile}, removing from queue`,
                    );
                    this.removeFromLeaveMap(mobile);
                    continue;
                }

                const channelsToProcess = channels.splice(
                    0,
                    this.LEAVE_CHANNEL_BATCH_SIZE,
                );
                this.logger.debug(
                    `${mobile} has ${channels.length} pending channels to leave, processing ${channelsToProcess.length} channels`,
                );

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

                this.logger.debug(
                    `${mobile} attempting to leave ${channelsToProcess.length} channels`,
                );
                await sleep(1500);
                await client.leaveChannels(channelsToProcess);
                this.logger.debug(
                    `${mobile} left ${channelsToProcess.length} channels successfully`,
                );
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
                        await this.remove(mobile, `LeaveChannelErr: ${errorDetails.message}`);
                        await sleep(2000);
                    } catch (removeError) {
                        this.logger.error(`Error removing client ${mobile}:`, removeError);
                    }
                    this.removeFromLeaveMap(mobile);
                } else {
                    this.logger.warn(
                        `Transient error for ${mobile}: ${errorDetails.message}`,
                    );
                }
            } finally {
                try {
                    await connectionManager.unregisterClient(mobile);
                } catch (unregisterError) {
                    this.logger.error(
                        `Error unregistering client ${mobile}: ${unregisterError.message}`,
                    );
                }

                // Add delay between leave operations
                if (
                    i < keys.length - 1 ||
                    this.leaveChannelMap.get(mobile)?.length > 0
                ) {
                    await sleep(this.LEAVE_CHANNEL_INTERVAL / 2); // Half the interval as delay
                }
            }
        }
    }

    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(
                `Clearing leave channel interval: ${this.leaveChannelIntervalId}`,
            );
            clearInterval(this.leaveChannelIntervalId);
            this.activeTimeouts.delete(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug(
            'Leave channel interval cleared and processing flag reset',
        );
    }

    async setAsPromoteClient(
        mobile: string,
        availableDate: string = new Date(Date.now() - 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
    ) {
        const user = (
            await this.usersService.search({ mobile, expired: false })
        )[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new ConflictException('PromoteClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);

        // Check if this mobile is already assigned as a promote mobile
        const existingAssignment = await this.promoteClientModel.findOne({
            mobile,
            clientId: { $exists: true },
        });

        if (!clientMobiles.includes(mobile) && !existingAssignment) {
            const telegramClient = await connectionManager.getClient(mobile, {
                autoDisconnect: false,
            });
            try {
                await telegramClient.set2fa();
                await sleep(15000);
                await telegramClient.updateUsername('');
                await sleep(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await sleep(3000);
                await telegramClient.updateProfile(
                    'Deleted Account',
                    'Deleted Account',
                );
                await sleep(3000);
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(
                    mobile,
                    true,
                );
                const promoteClient = {
                    tgId: user.tgId,
                    lastActive: 'default',
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                    status: 'active', // Set default status
                    message: 'Manually configured as promote client', // Set initial message
                    lastUsed: null, // Initially not used
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
            }
            await connectionManager.unregisterClient(mobile);
            return 'Client set as promote successfully';
        } else {
            throw new BadRequestException('Number is a Active Client');
        }
    }
    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            const clients = await this.clientService.findAll();
            const bufferClients = await this.bufferClientService.findAll();

            const clientMainMobiles = clients.map((c) => c.mobile);
            const bufferClientIds = bufferClients.map((c) => c.mobile);

            const assignedPromoteMobiles = await this.promoteClientModel
                .find({ clientId: { $exists: true }, status: 'active' })
                .distinct('mobile');

            const goodIds = [
                ...clientMainMobiles,
                ...bufferClientIds,
                ...assignedPromoteMobiles,
            ].filter(Boolean);

            const promoteClientsPerClient = new Map<string, number>();
            const clientNeedingPromoteClients: string[] = [];

            // Count existing active promote clients per clientId using aggregation for better performance
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
                    },
                },
            ]);

            for (const result of promoteClientCounts) {
                promoteClientsPerClient.set(result._id, result.count);
            }

            for (const client of clients) {
                const assignedCount = promoteClientsPerClient.get(client.clientId) || 0;
                promoteClientsPerClient.set(client.clientId, assignedCount);

                const needed = Math.max(
                    0,
                    this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount,
                );
                if (needed > 0) {
                    clientNeedingPromoteClients.push(client.clientId);
                }
            }

            // Count needed promote clients for tracking only
            let totalSlotsNeeded = 0;

            // Distribute the slots across clients that need promote clients
            for (const clientId of clientNeedingPromoteClients) {
                if (totalSlotsNeeded >= this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) break;

                const assignedCount = promoteClientsPerClient.get(clientId) || 0;
                const needed = Math.max(
                    0,
                    this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount,
                );
                const allocatedForThisClient = Math.min(
                    needed,
                    this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER - totalSlotsNeeded,
                );

                totalSlotsNeeded += allocatedForThisClient;
            }

            this.logger.debug(
                `Promote clients per client: ${JSON.stringify(Object.fromEntries(promoteClientsPerClient))}`,
            );
            this.logger.debug(
                `Clients needing promote clients: ${clientNeedingPromoteClients.join(', ')}`,
            );
            this.logger.debug(
                `Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER} per trigger)`,
            );

            // Get total active promote clients count for logging
            const totalActivePromoteClients =
                await this.promoteClientModel.countDocuments({ status: 'active' });
            this.logger.debug(
                `Total active promote clients: ${totalActivePromoteClients}`,
            );

            // Only proceed with creating new promote clients if we have clients that need them
            if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
                await this.addNewUserstoPromoteClients(
                    [],
                    goodIds,
                    clientNeedingPromoteClients,
                    promoteClientsPerClient,
                );
            } else {
                this.logger.debug(
                    'No new promote clients needed - all clients have sufficient promote clients',
                );
            }
        } else {
            this.logger.warn(
                'Ignored active check promote channels as active client setup exists',
            );
        }
    }

    async addNewUserstoPromoteClients(
        badIds: string[],
        goodIds: string[],
        clientsNeedingPromoteClients: string[] = [],
        promoteClientsPerClient?: Map<string, number>,
    ) {
        const sixMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];

        // Calculate total needed based on client requirements
        let totalNeededFromClients = 0;
        for (const clientId of clientsNeedingPromoteClients) {
            let needed = 0;
            if (promoteClientsPerClient) {
                const currentCount = promoteClientsPerClient.get(clientId) || 0;
                needed = Math.max(
                    0,
                    this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount,
                );
            } else {
                // Fallback to database query if map not provided - only count active
                const currentCount = await this.promoteClientModel.countDocuments({
                    clientId,
                    status: 'active',
                });
                needed = Math.max(
                    0,
                    this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount,
                );
            }
            totalNeededFromClients += needed;
        }

        // Limit to maximum 10 new promote clients per trigger
        const totalNeeded = Math.min(totalNeededFromClients, 10);

        if (totalNeeded === 0) {
            this.logger.debug(
                'No promote clients needed - all clients have sufficient promote clients or limit reached',
            );
            return;
        }

        this.logger.debug(
            `Limited to creating ${totalNeeded} new promote clients (max 10 per trigger)`,
        );

        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: sixMonthsAgo },
                totalChats: { $gt: 150 },
            },
            { tgId: 1 },
            totalNeeded + 5, // Get a few extra in case some fail
        );

        this.logger.debug(
            `New promote documents to be added: ${documents.length} for ${clientsNeedingPromoteClients.length} clients needing promote clients (limited to ${totalNeeded})`,
        );

        let processedCount = 0;
        const clientAssignmentTracker = new Map<string, number>();

        // Initialize tracker for clients that need promote clients
        for (const clientId of clientsNeedingPromoteClients) {
            let needed = 0;
            if (promoteClientsPerClient) {
                const currentCount = promoteClientsPerClient.get(clientId) || 0;
                needed = Math.max(
                    0,
                    this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount,
                );
            } else {
                // Fallback to database query if map not provided - only count active
                const currentCount = await this.promoteClientModel.countDocuments({
                    clientId,
                    status: 'active',
                });
                needed = Math.max(
                    0,
                    this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount,
                );
            }
            clientAssignmentTracker.set(clientId, needed);
        }

        while (
            processedCount <
            Math.min(totalNeeded, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) &&
            documents.length > 0 &&
            clientsNeedingPromoteClients.length > 0
        ) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }

            // Find a client that still needs promote clients
            let targetClientId: string | null = null;
            for (const clientId of clientsNeedingPromoteClients) {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                if (needed > 0) {
                    targetClientId = clientId;
                    break;
                }
            }

            if (!targetClientId) {
                this.logger.debug(
                    'All clients have sufficient promote clients assigned',
                );
                break;
            }

            try {
                const client = await connectionManager.getClient(document.mobile, {
                    autoDisconnect: false,
                });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(
                        `hasPassword for ${document.mobile}: ${hasPassword}`,
                    );
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        this.logger.debug('Waiting for setting 2FA');
                        await sleep(30000);
                        await client.updateUsername('');
                        await sleep(3000);
                        await client.updatePrivacyforDeletedAccount();
                        await sleep(3000);
                        await client.updateProfile('Deleted Account', 'Deleted Account');
                        await sleep(3000);
                        await client.deleteProfilePhotos();
                        const channels = await channelInfo(client.client, true);
                        this.logger.debug(
                            `Inserting Document for client ${targetClientId}`,
                        );
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: 'today',
                            mobile: document.mobile,
                            availableDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
                                .toISOString()
                                .split('T')[0],
                            channels: channels.ids.length,
                            clientId: targetClientId, // Assign to specific client
                            status: 'active', // Set default status
                            message: 'Account successfully configured as promote client', // Set initial message
                            lastUsed: null, // Initially not used
                        };
                        await this.create(promoteClient);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(
                                `Failed to update user 2FA status for ${document.mobile}:`,
                                userUpdateError,
                            );
                            // Continue anyway as this is not critical
                        }
                        await this.sessionService.getOldestSessionOrCreate({
                            mobile: document.mobile
                        })

                        this.logger.log(
                            `=============Created PromoteClient for ${targetClientId}==============`,
                        );
                    } else {
                        this.logger.debug(
                            `Failed to Update as PromoteClient as ${document.mobile} already has Password`,
                        );
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        } catch (userUpdateError) {
                            this.logger.warn(
                                `Failed to update user 2FA status for ${document.mobile}:`,
                                userUpdateError,
                            );
                        }
                    }

                    // Update tracker and remove client from list if satisfied (regardless of success/failure)
                    const currentNeeded =
                        clientAssignmentTracker.get(targetClientId) || 0;
                    const newNeeded = Math.max(0, currentNeeded - 1);
                    clientAssignmentTracker.set(targetClientId, newNeeded);

                    if (newNeeded === 0) {
                        const index = clientsNeedingPromoteClients.indexOf(targetClientId);
                        if (index > -1) {
                            clientsNeedingPromoteClients.splice(index, 1);
                        }
                    }

                    this.logger.debug(
                        `Client ${targetClientId}: ${newNeeded} more needed, ${totalNeeded - processedCount - 1} remaining in this batch`,
                    );
                    processedCount++; // Always increment to prevent infinite loops
                } catch (error: any) {
                    this.logger.error(
                        `Error processing client ${document.mobile}: ${error.message}`,
                    );
                    parseError(error);
                    processedCount++; // Always increment even on errors to prevent infinite loops
                } finally {
                    try {
                        await connectionManager.unregisterClient(document.mobile);
                    } catch (unregisterError: any) {
                        this.logger.error(
                            `Error unregistering client ${document.mobile}: ${unregisterError.message}`,
                        );
                    }
                }
            } catch (error: any) {
                this.logger.error(
                    `Error creating client connection for ${document.mobile}: ${error.message}`,
                );
                parseError(error);
            }
        }

        // Log completion status
        this.logger.log(
            `✅ Batch completed: Created ${processedCount} new promote clients (max ${totalNeeded} per trigger)`,
        );
        if (clientsNeedingPromoteClients.length > 0) {
            const stillNeeded = clientsNeedingPromoteClients
                .map((clientId) => {
                    const needed = clientAssignmentTracker.get(clientId) || 0;
                    return `${clientId}:${needed}`;
                })
                .join(', ');
            this.logger.log(`⏳ Still needed in future triggers: ${stillNeeded}`);
        } else {
            this.logger.log(`🎉 All clients now have sufficient promote clients!`);
        }
    }

    private clearAllTimeouts(): void {
        this.activeTimeouts.forEach((timeout) => {
            clearTimeout(timeout);
        });
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }

    private async cleanup(): Promise<void> {
        try {
            // Clear all timeouts
            this.clearAllTimeouts();
            this.clearMemoryCleanup();

            // Clear intervals
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();

            // Clear maps
            this.clearPromoteMap();
            this.clearLeaveMap();

            // Reset processing flags
            this.isJoinChannelProcessing = false;
            this.isLeaveChannelProcessing = false;

            this.logger.log('BufferClientService cleanup completed');
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }

    async onModuleDestroy() {
        this.logger.log('Cleaning up PromoteClientService resources');
        await this.cleanup();
        this.logger.log('PromoteClientService cleanup completed');
    }

    /**
     * Get promote client distribution per client for monitoring and debugging
     */
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

        // Get aggregated data in single queries for better performance
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
            this.promoteClientModel.countDocuments(),
            this.promoteClientModel.countDocuments({ clientId: { $exists: false } }),
            this.promoteClientModel.countDocuments({ status: 'active' }),
            this.promoteClientModel.countDocuments({ status: 'inactive' }),
            // Get assigned counts per client
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            // Get active counts per client
            this.promoteClientModel.aggregate([
                {
                    $match: { clientId: { $exists: true, $ne: null }, status: 'active' },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            // Get inactive counts per client
            this.promoteClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'inactive',
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            // Get never used counts per client
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
            // Get recently used counts per client
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

        // Convert aggregation results to maps for easy lookup
        const assignedCountMap = new Map(
            assignedCounts.map((item: any) => [item._id, item.count]),
        );
        const activeCountMap = new Map(
            activeCounts.map((item: any) => [item._id, item.count]),
        );
        const inactiveCountMap = new Map(
            inactiveCounts.map((item: any) => [item._id, item.count]),
        );
        const neverUsedCountMap = new Map(
            neverUsedCounts.map((item: any) => [item._id, item.count]),
        );
        const recentlyUsedCountMap = new Map(
            recentlyUsedCounts.map((item: any) => [item._id, item.count]),
        );

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
            const needed = Math.max(
                0,
                this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - activeCount,
            ); // Only count active clients
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

        const maxPerTrigger = 10;
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

    /**
     * Get all promote clients by status
     */
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

    async getLeastRecentlyUsedPromoteClients(
        clientId: string,
        limit: number = 1,
    ): Promise<PromoteClient[]> {
        return this.promoteClientModel
            .find({ clientId, status: 'active' })
            .sort({ lastUsed: 1, _id: 1 }) // Sort by lastUsed ascending (oldest first), then by _id for consistency
            .limit(limit)
            .exec();
    }

    /**
     * Get next available promote client for a specific client (round-robin based on lastUsed)
     */
    async getNextAvailablePromoteClient(
        clientId: string,
    ): Promise<PromoteClient | null> {
        const clients = await this.getLeastRecentlyUsedPromoteClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }

    /**
     * Get promote clients that haven't been used for a specified time period
     */
    async getUnusedPromoteClients(
        hoursAgo: number = 24,
        clientId?: string,
    ): Promise<PromoteClient[]> {
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

    /**
     * Get usage statistics for promote clients
     */
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
            this.promoteClientModel
                .find(filter, { lastUsed: 1, createdAt: 1 })
                .exec(),
        ]);

        // Calculate average usage gap
        let totalGap = 0;
        let gapCount = 0;

        for (const client of allClients) {
            if (client.lastUsed) {
                const gap = now.getTime() - new Date(client.lastUsed).getTime();
                totalGap += gap;
                gapCount++;
            }
        }

        const averageUsageGap =
            gapCount > 0 ? totalGap / gapCount / (60 * 60 * 1000) : 0; // in hours

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
