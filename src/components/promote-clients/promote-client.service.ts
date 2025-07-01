import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, OnModuleDestroy, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePromoteClientDto } from './dto/create-promote-client.dto';
import { PromoteClient, PromoteClientDocument } from './schemas/promote-client.schema';
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
@Injectable()
export class PromoteClientService implements OnModuleDestroy {
    private readonly logger = new Logger(PromoteClientService.name);
    private joinChannelMap: Map<string, Channel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout;
    private leaveChannelMap: Map<string, string[]> = new Map();
    private leaveChannelIntervalId: NodeJS.Timeout;
    private isLeaveChannelProcessing: boolean = false;
    private isJoinChannelProcessing: boolean = false;
    private readonly JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000; // 4 minutes
    private readonly LEAVE_CHANNEL_INTERVAL = 60 * 1000; // 60 seconds
    private readonly LEAVE_CHANNEL_BATCH_SIZE = 10;
    constructor(@InjectModel('promoteClientModule') private promoteClientModel: Model<PromoteClientDocument>,
        @Inject(forwardRef(() => TelegramService))
        private telegramService: TelegramService,
        @Inject(forwardRef(() => UsersService))
        private usersService: UsersService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private activeChannelsService: ActiveChannelsService,
        @Inject(forwardRef(() => ClientService))
        private clientService: ClientService,
        @Inject(forwardRef(() => ActiveChannelsService))
        private channelsService: ChannelsService,
        @Inject(forwardRef(() => BufferClientService))
        private bufferClientService: BufferClientService,
        @Inject(forwardRef(() => SessionService))
        private sessionService: SessionService,
    ) {}

    async create(promoteClient: CreatePromoteClientDto): Promise<PromoteClient> {
        const newUser = new this.promoteClientModel(promoteClient);
        return newUser.save();
    }

    async findAll(): Promise<PromoteClient[]> {
        return this.promoteClientModel.find().exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<PromoteClient> {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user;
    }


    async update(mobile: string, updateClientDto: UpdatePromoteClientDto): Promise<PromoteClient> {
        const updatedUser = await this.promoteClientModel.findOneAndUpdate(
            { mobile },
            { $set: updateClientDto },
            { new: true, upsert: true, returnDocument: 'after' }
        ).exec();

        if (!updatedUser) {
            throw new NotFoundException(`User with mobile ${mobile} not found`);
        }

        return updatedUser;
    }

    async createOrUpdate(mobile: string, createOrUpdateUserDto: CreatePromoteClientDto | UpdatePromoteClientDto): Promise<PromoteClient> {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating")
            return this.update(existingUser.mobile, createOrUpdateUserDto as UpdatePromoteClientDto);
        } else {
            console.log("creating")
            return this.create(createOrUpdateUserDto as CreatePromoteClientDto);
        }
    }

    async remove(mobile: string): Promise<void> {
        try {
            const promoteClient = await this.findOne(mobile, false);
            if (!promoteClient) {
                throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing PromoteClient with mobile: ${mobile}`);
            await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Deleting Promote Client : ${mobile}`)}`);
            await this.promoteClientModel.deleteOne({ mobile }).exec();
        } catch (error) {
            const errorDetails = parseError(error);
            this.logger.error(`Error removing PromoteClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`PromoteClient with mobile ${mobile} removed successfully`);
    }
    async search(filter: any): Promise<PromoteClient[]> {
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
        return this.promoteClientModel.find(filter).exec();
    }

    async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<PromoteClient[]> {
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
        this.joinChannelMap.delete(key)
    }
    clearPromoteMap() {
        console.log("PromoteMap cleared");
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }

    async joinchannelForPromoteClients(skipExisting: boolean = true): Promise<string> {
        if (!this.telegramService.getActiveClientSetup()) {
            this.logger.log('Starting join channel process');

            // Clear both queues before starting new process
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();

            try {
                await connectionManager.disconnectAll();
                await sleep(2000);
                const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys())
                const clients = await this.promoteClientModel.find({ channels: { "$lt": 300 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(8);

                this.logger.debug(`Found ${clients.length} clients to process for joining channels`);

                if (clients.length > 0) {
                    for (const document of clients) {
                        try {
                            this.logger.debug(`Processing client: ${document.mobile}`);
                            const client = await connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: false });

                            const channels = await client.channelInfo(true);
                            this.logger.debug(`${document.mobile}: Found ${channels.ids.length} existing channels`);

                            await this.update(document.mobile, { channels: channels.ids.length });

                            if (channels.canSendFalseCount < 10) {
                                if (channels.ids.length < 220) {
                                    this.logger.debug(`${document.mobile}: Getting channels from channels service`);
                                    const result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                                    this.joinChannelMap.set(document.mobile, result);
                                    this.joinChannelQueue();
                                } else {
                                    this.logger.debug(`${document.mobile}: Getting channels from active channels service`);
                                    const result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                                    this.joinChannelMap.set(document.mobile, result);
                                    this.joinChannelQueue();
                                }
                            } else {
                                this.logger.debug(`${document.mobile}: Too many channels with no send permissions, queueing for leave: ${channels.canSendFalseChats.length}`);
                                this.leaveChannelMap.set(document.mobile, channels.canSendFalseChats);
                                this.leaveChannelQueue();
                            }
                        } catch (error) {
                            const errorDetails = parseError(error);
                            this.logger.error(`Error processing client ${document.mobile}:`, errorDetails);

                            if (error.message === "SESSION_REVOKED" ||
                                error.message === "AUTH_KEY_UNREGISTERED" ||
                                error.message === "USER_DEACTIVATED" ||
                                error.message === "USER_DEACTIVATED_BAN" ||
                                error.message === "FROZEN_METHOD_INVALID") {
                                this.logger.warn(`${document.mobile}: Session invalid, removing client`);
                                await this.remove(document.mobile);
                            }
                        } finally {
                            connectionManager.unregisterClient(document.mobile);
                        }
                    }
                }

                this.logger.log(`Join channel process initiated for ${clients.length} clients`);
                return `Initiated Joining channels ${clients.length}`
            } catch (error) {
                this.logger.error('Error during joinchannelForPromoteClients:', error);
                // Clean up on error
                this.clearJoinChannelInterval();
                this.clearLeaveChannelInterval();
                throw new Error("Failed to initiate channel joining process");
            }
        } else {
            this.logger.warn('Ignored active check promote channels as active client setup exists');
            return "Active client setup exists, skipping promotion";
        }
    }

    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running, instance:', this.joinChannelIntervalId);
            return;
        }

        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, skipping queue');
            return;
        }

        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            let processTimeout: NodeJS.Timeout;
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.log('Join channel map is empty, clearing interval');
                    this.clearJoinChannelInterval();
                    return;
                }

                // Add timeout to prevent infinite processing
                processTimeout = setTimeout(() => {
                    this.logger.error('Join channel interval processing timeout');
                    this.clearJoinChannelInterval();
                }, this.JOIN_CHANNEL_INTERVAL - 1000);

                this.logger.debug(`Processing join channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.joinChannelIntervalId}`);

                for (const mobile of keys) {
                    let currentChannel: Channel | null = null;
                    try {
                        const channels = this.joinChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No more channels to join for ${mobile}, removing from map`);
                            this.removeFromPromoteMap(mobile);
                            continue;
                        }

                        currentChannel = channels.shift();
                        // Only update map if there are remaining channels
                        if (channels.length > 0) {
                            this.logger.debug(`${mobile}: Pending channels to join: ${channels.length}`);
                            this.joinChannelMap.set(mobile, channels);
                        } else {
                            this.removeFromPromoteMap(mobile);
                        }

                        await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile}: Attempting to join channel: @${currentChannel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                    } catch (error: any) {
                        const errorDetails = parseError(error, `${mobile} @${currentChannel?.username || 'unknown'} Outer Err ERR: `, false);
                        this.logger.error(`${mobile}: Error joining @${currentChannel?.username || 'unknown'}:`, errorDetails);

                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile}: FloodWaitError or too many channels, handling...`);
                            this.removeFromPromoteMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                        if (error.errorMessage === "SESSION_REVOKED" ||
                            error.errorMessage === "AUTH_KEY_UNREGISTERED" ||
                            error.errorMessage === "USER_DEACTIVATED" ||
                            error.errorMessage === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            await this.remove(mobile);
                        }
                    } finally {
                        await connectionManager.unregisterClient(mobile);
                    }
                }
            } catch (error) {
                this.logger.error('Error in join channel interval', error);
                this.clearJoinChannelInterval();
            } finally {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
            }
        }, this.JOIN_CHANNEL_INTERVAL);

        this.logger.debug(`Started join channel queue with interval ID: ${this.joinChannelIntervalId}`);
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval: ${this.joinChannelIntervalId}`);
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            this.isJoinChannelProcessing = false;

            // Only schedule next run if there are items in the map
            if (this.joinChannelMap.size > 0) {
                setTimeout(() => {
                    this.logger.debug('Triggering next join channel process');
                    this.joinchannelForPromoteClients(false);
                }, 30000);
            }
        }
    }

    removeFromLeaveMap(key: string) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }

    clearLeaveMap() {
        console.log("LeaveMap cleared");
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
    }

    async leaveChannelQueue() {
        if (this.isLeaveChannelProcessing || this.leaveChannelIntervalId) {
            this.logger.warn('Leave channel process is already running');
            return;
        }

        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }

        this.isLeaveChannelProcessing = true;
        this.leaveChannelIntervalId = setInterval(async () => {
            let processTimeout: NodeJS.Timeout;
            try {
                const keys = Array.from(this.leaveChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.debug('Leave map is empty, clearing interval');
                    this.clearLeaveChannelInterval();
                    return;
                }

                // Add timeout to prevent infinite processing
                processTimeout = setTimeout(() => {
                    this.logger.error('Leave channel interval processing timeout');
                    this.clearLeaveChannelInterval();
                }, this.LEAVE_CHANNEL_INTERVAL - 1000);

                this.logger.debug(`Processing leave channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.leaveChannelIntervalId}`);

                for (const mobile of keys) {
                    try {
                        this.logger.debug(`Processing leave channels for mobile: ${mobile}`);
                        const channels = this.leaveChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No channels to leave for mobile: ${mobile}`);
                            this.removeFromLeaveMap(mobile);
                            continue;
                        }

                        const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);

                        // Only update map if there are remaining channels
                        if (channels.length > 0) {
                            this.logger.debug(`${mobile}: Processing ${channelsToProcess.length} channels, ${channels.length} remaining`);
                            this.leaveChannelMap.set(mobile, channels);
                        } else {
                            this.removeFromLeaveMap(mobile);
                        }

                        const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile}: Attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile}: Successfully left ${channelsToProcess.length} channels`);
                    } catch (error: any) {
                        const errorDetails = parseError(error);
                        this.logger.error(`Error in leave channel process for ${mobile}:`, errorDetails);
                        if (
                            errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN"
                        ) {
                            this.logger.warn(`${mobile}: Session invalid, removing client`);
                            await this.remove(mobile);
                            this.removeFromLeaveMap(mobile);
                        }
                    } finally {
                        await connectionManager.unregisterClient(mobile);
                    }
                }
            } catch (error) {
                this.logger.error('Error in leave channel interval', error);
                this.clearLeaveChannelInterval();
            } finally {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
            }
        }, this.LEAVE_CHANNEL_INTERVAL);

        this.logger.debug(`Started leave channel queue with interval ID: ${this.leaveChannelIntervalId}`);
    }

    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval: ${this.leaveChannelIntervalId}`);
            clearInterval(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug('Leave channel interval cleared and processing flag reset');
    }

    async setAsPromoteClient(
        mobile: string,
        availableDate: string = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]
    ) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false)
        if (isExist) {
            throw new ConflictException('PromoteClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientMobiles.includes(mobile) && !clientPromoteMobiles.includes(mobile)) {
            const telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false });
            try {
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
                const promoteClient = {
                    tgId: user.tgId,
                    lastActive: "default",
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                }
                await this.promoteClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: promoteClient }, { new: true, upsert: true }).exec();
            } catch (error) {
                const errorDetails = parseError(error)
                throw new HttpException(errorDetails.message, errorDetails.status)
            }
            await connectionManager.unregisterClient(mobile)
            return "Client set as promote successfully";
        } else {
            throw new BadRequestException("Number is a Active Client")
        }
    }
    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await connectionManager.disconnectAll();
            await sleep(2000);

            const promoteclients = await this.findAll();
            let goodIds: string[] = [];
            const badIds: string[] = [];

            // Fill badIds with dummy entries if promoteclients < 80
            if (promoteclients.length < 80) {
                for (let i = 0; i < 80 - promoteclients.length && badIds.length < 10; i++) {
                    badIds.push(i.toString());
                }
            }

            const clients = await this.clientService.findAll();
            const bufferClients = await this.bufferClientService.findAll();

            const clientIds = [...clients.map(c => c.mobile), ...clients.flatMap(c => c.promoteMobile)].filter(Boolean);
            const bufferClientIds = bufferClients.map(c => c.mobile);

            const today = new Date().toISOString().split('T')[0];

            // Chunk logic (manual, no lodash)
            const chunkArray = <T>(arr: T[], size: number): T[][] => {
                const chunks: T[][] = [];
                for (let i = 0; i < arr.length; i += size) {
                    chunks.push(arr.slice(i, i + size));
                }
                return chunks;
            };

            const chunks = chunkArray(promoteclients, 4);

            for (const batch of chunks) {
                await Promise.all(batch.map(async (document) => {
                    if (!clientIds.includes(document.mobile) && !bufferClientIds.includes(document.mobile)) {
                        try {
                            const cli = await connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: true });
                            const me = await cli.getMe();

                            if (me.username) {
                                await this.telegramService.updateUsername(document.mobile, '');
                                await sleep(2000);
                            }

                            if (me.firstName !== "Deleted Account") {
                                await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                                await sleep(2000);
                            }

                            await this.telegramService.deleteProfilePhotos(document.mobile);

                            const hasPassword = await cli.hasPassword();
                            if (!hasPassword && badIds.length < 4) {
                                console.log("Client does not have password");
                                badIds.push(document.mobile);
                            } else {
                                console.log(document.mobile, " :  ALL Good");
                                goodIds.push(document.mobile);
                            }

                            await this.telegramService.removeOtherAuths(document.mobile);
                            await sleep(2000);
                        } catch (error) {
                            parseError(error, `Error occurred while creating client for ${document.mobile} in checkPromoteClients: `, false);
                            badIds.push(document.mobile);
                            await this.remove(document.mobile);
                        } finally {
                            await connectionManager.unregisterClient(document.mobile);
                        }
                    } else {
                        console.log("Number is an Active Client");
                        goodIds.push(document.mobile);
                        await this.remove(document.mobile);
                    }
                }));
            }

            goodIds = [...new Set([...goodIds, ...clientIds, ...bufferClientIds])];
            this.logger.debug(`GoodIds: ${goodIds.length}, BadIds: ${badIds.length}`);
            await this.addNewUserstoPromoteClients(badIds, goodIds);
        } else {
            this.logger.warn("Ignored active check promote channels as active client setup exists");
        }
    }

    async addNewUserstoPromoteClients(badIds: string[], goodIds: string[]) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery(
            {
                mobile: { $nin: goodIds },
                expired: false,
                twoFA: false,
                lastActive: { $lt: sixMonthsAgo },
                totalChats: { $gt: 250 }
            },
            { tgId: 1 },
            badIds.length + 3
        );

        this.logger.debug(`New promote documents to be added: ${documents.length}`);

        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }
            try {
                const client = await connectionManager.getClient(document.mobile, { autoDisconnect: false });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        console.log("waiting for setting 2FA");
                        await sleep(30000);
                        await client.updateUsername('');
                        await sleep(3000)
                        await client.updatePrivacyforDeletedAccount();
                        await sleep(3000)
                        await client.updateProfile("Deleted Account", "Deleted Account");
                        await sleep(3000)
                        await client.deleteProfilePhotos();
                        const channels = await client.channelInfo(true)
                        console.log("Inserting Document");
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: "today",
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        }
                        await this.sessionService.createSession({ mobile: document.mobile, password: 'Ajtdmwajt1@' });
                        await this.create(promoteClient);
                        await this.usersService.update(document.tgId, { twoFA: true })
                        console.log("=============Created PromoteClient=============")
                        badIds.pop();
                    } else {
                        console.log("Failed to Update as PromoteClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true })
                    }
                } catch (error: any) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`);
                    parseError(error);
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
        setTimeout(() => {
            this.joinchannelForPromoteClients()
        }, 2 * 60 * 1000);
    }

    async onModuleDestroy() {
        this.logger.log('Cleaning up PromoteClientService resources');
        this.clearPromoteMap();
        this.clearLeaveMap();
        await connectionManager.disconnectAll();
    }
}
